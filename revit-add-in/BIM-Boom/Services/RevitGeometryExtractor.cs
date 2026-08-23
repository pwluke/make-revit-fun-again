using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;
using BIM_Boom.Models;

namespace BIM_Boom.Services;

/// <summary>
/// Extracts triangulated geometry and material colors directly from Revit elements.
/// No IFC export, no transactions — purely read-only Revit API calls.
/// Must run on the Revit API thread (inside ExternalEvent handler).
/// </summary>
public static class RevitGeometryExtractor
{
    private static readonly (byte R, byte G, byte B, byte A) FallbackGray = (160, 160, 160, 255);

    /// <summary>
    /// Extract a merged triangle mesh with per-triangle colors from the selected elements.
    /// </summary>
    public static (MergedMesh Mesh, int GrayFallbackCount) ExtractGeometry(
        Document doc, ICollection<ElementId> elementIds)
    {
        var mesh = new MergedMesh();
        int grayCount = 0;

        double minX = double.MaxValue, minY = double.MaxValue, minZ = double.MaxValue;
        double maxX = double.MinValue, maxY = double.MinValue, maxZ = double.MinValue;

        var options = new Options
        {
            ComputeReferences = false,
            DetailLevel = ViewDetailLevel.Fine
        };

        foreach (var id in elementIds)
        {
            var element = doc.GetElement(id);
            if (element == null) continue;

            var color = GetElementColor(doc, element, ref grayCount);
            var geomElement = element.get_Geometry(options);
            if (geomElement == null) continue;

            ExtractGeometryElement(geomElement, color, mesh,
                ref minX, ref minY, ref minZ, ref maxX, ref maxY, ref maxZ);
        }

        mesh.BBoxMin = (minX, minY, minZ);
        mesh.BBoxMax = (maxX, maxY, maxZ);

        return (mesh, grayCount);
    }

    /// <summary>
    /// Extract one mesh per game layer, so each layer can be voxelised and
    /// written to its own file. Elements the game has no use for — doors,
    /// windows, annotation, MEP — are skipped, and every layer gets an entry
    /// even when nothing in the model lands on it: the web app fetches all ten
    /// files in one Promise.all and a single 404 fails the whole model load.
    /// </summary>
    /// <param name="doc">The document to read.</param>
    /// <param name="elementIds">
    /// Elements to consider, or null for the whole model.
    /// </param>
    public static (Dictionary<string, MergedMesh> Layers, int Elements, int GrayFallbackCount)
        ExtractByLayer(Document doc, ICollection<ElementId>? elementIds)
    {
        var layers = new Dictionary<string, MergedMesh>();
        foreach (var layer in GameLayers.All) layers[layer.Id] = new MergedMesh();

        var bounds = new Dictionary<string, Bounds>();
        foreach (var layer in GameLayers.All) bounds[layer.Id] = Bounds.Empty();

        var options = new Options
        {
            ComputeReferences = false,
            DetailLevel = ViewDetailLevel.Fine
        };

        var elements = CollectElements(doc, elementIds);
        int grayCount = 0;
        int used = 0;

        foreach (var element in elements)
        {
            var layer = GameLayers.LayerFor(element);
            if (layer == null) continue;

            var geomElement = element.get_Geometry(options);
            if (geomElement == null) continue;

            var color = GetElementColor(doc, element, ref grayCount);
            var mesh = layers[layer.Id];
            var box = bounds[layer.Id];

            ExtractGeometryElement(geomElement, color, mesh,
                ref box.MinX, ref box.MinY, ref box.MinZ,
                ref box.MaxX, ref box.MaxY, ref box.MaxZ);

            bounds[layer.Id] = box;
            used++;
        }

        foreach (var layer in GameLayers.All)
        {
            var box = bounds[layer.Id];
            layers[layer.Id].BBoxMin = (box.MinX, box.MinY, box.MinZ);
            layers[layer.Id].BBoxMax = (box.MaxX, box.MaxY, box.MaxZ);
        }

        return (layers, used, grayCount);
    }

    private static IEnumerable<Element> CollectElements(
        Document doc, ICollection<ElementId>? elementIds)
    {
        if (elementIds != null && elementIds.Count > 0)
        {
            var selected = new List<Element>();
            foreach (var id in elementIds)
            {
                var element = doc.GetElement(id);
                if (element != null) selected.Add(element);
            }
            return selected;
        }

        // Whole model: one collector pass over just the categories a layer wants,
        // rather than every element in the document. The BuiltInCategory overload
        // avoids `new ElementId(BuiltInCategory)`, which is Revit 2024+ only.
        return new FilteredElementCollector(doc)
            .WhereElementIsNotElementType()
            .WherePasses(new ElementMulticategoryFilter(GameLayers.AllCategories()))
            .ToElements();
    }

    /// <summary>Mutable bbox accumulator, so each layer tracks its own extent.</summary>
    private struct Bounds
    {
        public double MinX, MinY, MinZ, MaxX, MaxY, MaxZ;

        public static Bounds Empty() => new()
        {
            MinX = double.MaxValue,
            MinY = double.MaxValue,
            MinZ = double.MaxValue,
            MaxX = double.MinValue,
            MaxY = double.MinValue,
            MaxZ = double.MinValue
        };
    }

    private static void ExtractGeometryElement(
        GeometryElement geomElement,
        (byte R, byte G, byte B, byte A) color,
        MergedMesh mesh,
        ref double minX, ref double minY, ref double minZ,
        ref double maxX, ref double maxY, ref double maxZ)
    {
        foreach (var geomObj in geomElement)
        {
            switch (geomObj)
            {
                case Solid solid when solid.Faces.Size > 0:
                    ExtractSolid(solid, color, mesh,
                        ref minX, ref minY, ref minZ, ref maxX, ref maxY, ref maxZ);
                    break;

                case GeometryInstance instance:
                    var instGeom = instance.GetInstanceGeometry();
                    if (instGeom != null)
                    {
                        ExtractGeometryElement(instGeom, color, mesh,
                            ref minX, ref minY, ref minZ, ref maxX, ref maxY, ref maxZ);
                    }
                    break;
            }
        }
    }

    private static void ExtractSolid(
        Solid solid,
        (byte R, byte G, byte B, byte A) defaultColor,
        MergedMesh mesh,
        ref double minX, ref double minY, ref double minZ,
        ref double maxX, ref double maxY, ref double maxZ)
    {
        foreach (Face face in solid.Faces)
        {
            var triangulation = face.Triangulate();
            if (triangulation == null) continue;

            for (int i = 0; i < triangulation.NumTriangles; i++)
            {
                var tri = triangulation.get_Triangle(i);
                var p0 = tri.get_Vertex(0);
                var p1 = tri.get_Vertex(1);
                var p2 = tri.get_Vertex(2);

                var v0 = (p0.X, p0.Y, p0.Z);
                var v1 = (p1.X, p1.Y, p1.Z);
                var v2 = (p2.X, p2.Y, p2.Z);

                mesh.Vertices.Add(v0);
                mesh.Vertices.Add(v1);
                mesh.Vertices.Add(v2);
                mesh.TriangleColors.Add(defaultColor);

                UpdateBounds(v0, ref minX, ref minY, ref minZ, ref maxX, ref maxY, ref maxZ);
                UpdateBounds(v1, ref minX, ref minY, ref minZ, ref maxX, ref maxY, ref maxZ);
                UpdateBounds(v2, ref minX, ref minY, ref minZ, ref maxX, ref maxY, ref maxZ);
            }
        }
    }

    private static (byte R, byte G, byte B, byte A) GetElementColor(
        Document doc, Element element, ref int grayCount)
    {
        // Try to get color from the element's material
        var materialId = GetPrimaryMaterialId(element);

        if (materialId != null && materialId != ElementId.InvalidElementId)
        {
            var material = doc.GetElement(materialId) as Material;
            if (material != null)
            {
                var c = material.Color;
                if (c.IsValid)
                {
                    byte transparency = (byte)(255 - (int)(material.Transparency * 255.0 / 100.0));
                    return (c.Red, c.Green, c.Blue, transparency);
                }
            }
        }

        // Try OverrideGraphicSettings from the active view
        // (not always available, so fall back to gray)
        grayCount++;
        return FallbackGray;
    }

    private static ElementId? GetPrimaryMaterialId(Element element)
    {
        // Try getting material from element parameters
        try
        {
            // Check structural material parameter
            var matParam = element.get_Parameter(BuiltInParameter.STRUCTURAL_MATERIAL_PARAM);
            if (matParam?.AsElementId() is { } id1 && id1 != ElementId.InvalidElementId)
                return id1;

            // Check material parameter for generic elements
            var param2 = element.get_Parameter(BuiltInParameter.MATERIAL_ID_PARAM);
            if (param2?.AsElementId() is { } id2 && id2 != ElementId.InvalidElementId)
                return id2;

            // Fallback: get first material from geometry
            var geomIds = element.GetMaterialIds(false);
            if (geomIds.Count > 0)
                return geomIds.First();
        }
        catch
        {
            // Ignore errors in material lookup
        }

        return null;
    }

    private static void UpdateBounds(
        (double X, double Y, double Z) pt,
        ref double minX, ref double minY, ref double minZ,
        ref double maxX, ref double maxY, ref double maxZ)
    {
        if (pt.X < minX) minX = pt.X;
        if (pt.Y < minY) minY = pt.Y;
        if (pt.Z < minZ) minZ = pt.Z;
        if (pt.X > maxX) maxX = pt.X;
        if (pt.Y > maxY) maxY = pt.Y;
        if (pt.Z > maxZ) maxZ = pt.Z;
    }
}
