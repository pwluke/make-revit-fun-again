using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using BIM_Boom.Models;

namespace BIM_Boom.Services;

/// <summary>
/// Writes the voxel layers as the JSON files the web game loads.
/// <para>
/// The shape is fixed by <c>lib/use-grid-points.ts</c>:
/// <c>{ "points": [ { "x": n, "y": n, "z": n }, ... ], "point_count": n }</c>,
/// one file per layer, named <c>{LAYER}_voxels.json</c>, served from the app's
/// <c>public/</c> folder.
/// </para>
/// <para>
/// <b>Coordinates stay in Revit's own Z-up system.</b> The web app rotates them
/// itself (<c>rhinoToThree</c> maps <c>(x, y, z)</c> to <c>(x, z, -y)</c>), so
/// converting here as well would rotate the building twice and lay it on its
/// side. This is why the export does not use <c>InstantDbClient.ToThreeJs</c>,
/// which is right for the live stream and wrong for these files.
/// </para>
/// <para>
/// Units do not have to be metres or feet or anything in particular. The web app
/// derives its scale from the median gap between coordinates and normalises one
/// voxel to 1/3 of a world unit, so any consistent unit lands correctly — which
/// is why writing Revit's internal feet straight out is fine.
/// </para>
/// </summary>
public static class GameJsonExporter
{
    /// <summary>
    /// Four decimals is well inside the web app's tolerance — it rounds to 4 when
    /// it infers the voxel pitch — and keeps a 370k-point file to a sane size.
    /// </summary>
    private const string Format = "0.####";

    public sealed class LayerResult
    {
        public string Id = "";
        public string Path = "";
        public int PointCount;
    }

    /// <summary>TARGET_BLOCK_SIZE in <c>lib/use-grid-points.ts</c>.</summary>
    private const double TargetBlockSize = 1.0 / 3.0;

    /// <summary>
    /// What <c>BUILDING_Y_OFFSET</c> in <c>lib/use-grid-points.ts</c> should be
    /// for this export, so the model's ground storey lands on the game's ground
    /// plane at y = 0.
    /// <para>
    /// This needs saying out loud because the web app hard-codes the offset at
    /// -4, tuned for the one model it shipped with. The app sits the model's
    /// <i>lowest</i> voxel at that offset, so how far the ground storey ends up
    /// above the ground plane depends entirely on how much foundation a model
    /// has below it. Export a model with a shallower base and the whole building
    /// sinks under the plane — the player then spawns on top of a buried
    /// building and sees an empty field. Translating the export cannot fix it:
    /// the app derives the placement from (ground - lowest), which no amount of
    /// shifting changes. The offset is the only lever, so hand over the number.
    /// </para>
    /// </summary>
    /// <param name="cellSizeFeet">The lattice pitch used for the export.</param>
    /// <param name="lowestZFeet">Lowest exported voxel centre, Revit Z, in feet.</param>
    /// <param name="groundZFeet">
    /// Elevation the player should stand on. 0 is the Revit project base point,
    /// which is normally the ground storey.
    /// </param>
    public static double RecommendedBuildingYOffset(
        double cellSizeFeet, double lowestZFeet, double groundZFeet = 0.0)
    {
        if (cellSizeFeet <= 0) return -4.0;
        var scale = TargetBlockSize / cellSizeFeet;
        return -(((groundZFeet - lowestZFeet) * scale) + TargetBlockSize / 2.0);
    }

    /// <summary>
    /// Write one file per layer into <paramref name="folder"/>. Layers with no
    /// geometry are still written, empty: the app fetches all ten in a single
    /// Promise.all, so a missing file fails the entire model load rather than
    /// just dropping that layer.
    /// </summary>
    public static List<LayerResult> WriteLayers(
        string folder, IReadOnlyDictionary<string, List<VoxelData>> voxelsByLayer)
    {
        Directory.CreateDirectory(folder);

        var results = new List<LayerResult>();
        foreach (var layerId in GameLayerIds.All)
        {
            voxelsByLayer.TryGetValue(layerId, out var voxels);
            var path = Path.Combine(folder, GameLayerIds.FileName(layerId));
            WriteLayer(path, voxels);
            results.Add(new LayerResult
            {
                Id = layerId,
                Path = path,
                PointCount = voxels?.Count ?? 0
            });
        }

        return results;
    }

    private static void WriteLayer(string path, List<VoxelData>? voxels)
    {
        var count = voxels?.Count ?? 0;

        // Hand-rolled rather than a serializer: System.Text.Json is not in the
        // box on the .NET Framework targets this add-in still builds for, and a
        // streamed writer keeps a 100 MB export off the heap.
        using var writer = new StreamWriter(path, false, new UTF8Encoding(false));
        writer.Write("{\n  \"points\": [");

        for (int i = 0; i < count; i++)
        {
            var voxel = voxels![i];
            writer.Write(i == 0 ? "\n" : ",\n");
            writer.Write("    {\"x\": ");
            // InvariantCulture on every number: on a machine with a comma decimal
            // separator the default would emit `1,5`, which is not valid JSON and
            // would fail in the browser with a parse error a long way from here.
            writer.Write(voxel.X.ToString(Format, CultureInfo.InvariantCulture));
            writer.Write(", \"y\": ");
            writer.Write(voxel.Y.ToString(Format, CultureInfo.InvariantCulture));
            writer.Write(", \"z\": ");
            writer.Write(voxel.Z.ToString(Format, CultureInfo.InvariantCulture));
            writer.Write("}");
        }

        if (count > 0) writer.Write("\n  ");
        writer.Write("],\n  \"point_count\": ");
        writer.Write(count.ToString(CultureInfo.InvariantCulture));
        writer.Write("\n}\n");
    }
}
