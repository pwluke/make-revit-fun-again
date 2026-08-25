using System.Collections.Generic;
using Autodesk.Revit.DB;

namespace BIM_Boom.Models;

/// <summary>
/// Which walls a layer takes, when a category has to be split between two
/// layers. Revit models both faces of a building with one Walls category; the
/// game keeps exterior and interior on separate layers so it can colour them
/// differently.
/// </summary>
public enum WallFilter
{
    Any,
    Exterior,
    Interior
}

/// <summary>
/// One layer of the exported model: a game layer id (see
/// <see cref="GameLayerIds"/>) plus the Revit categories that feed it.
/// </summary>
public sealed class GameLayer
{
    public GameLayer(string id, BuiltInCategory[] categories, WallFilter walls = WallFilter.Any)
    {
        Id = id;
        Categories = categories;
        Walls = walls;
    }

    public string Id { get; }
    public BuiltInCategory[] Categories { get; }
    public WallFilter Walls { get; }

    /// <summary>File name the web app fetches for this layer.</summary>
    public string FileName => GameLayerIds.FileName(Id);
}

public static class GameLayers
{
    /// <summary>
    /// The ten layers the game loads, in the same order as LAYER_ORDER.
    /// <para>
    /// Doors and windows are deliberately absent. They are openings: voxelising
    /// their panels and glazing walls up every doorway, and the game's bots and
    /// player walk the gaps between voxels — sealing the openings would make the
    /// interior unreachable. Leaving them out is what makes the model playable.
    /// </para>
    /// </summary>
    public static readonly GameLayer[] All =
    [
        new(GameLayerIds.Foundation, [BuiltInCategory.OST_StructuralFoundation]),
        new(GameLayerIds.Floor, [BuiltInCategory.OST_Floors]),
        // Floor-edge and floor-adjacent circulation. Railings and ramps read as
        // the outline of a slab from above, which is what this layer was.
        new(GameLayerIds.FloorOutline,
            [BuiltInCategory.OST_StairsRailing, BuiltInCategory.OST_Ramps]),
        new(GameLayerIds.ExteriorWall, [BuiltInCategory.OST_Walls], WallFilter.Exterior),
        new(GameLayerIds.InteriorWall, [BuiltInCategory.OST_Walls], WallFilter.Interior),
        new(GameLayerIds.Column,
            [BuiltInCategory.OST_Columns, BuiltInCategory.OST_StructuralColumns]),
        new(GameLayerIds.Stairs, [BuiltInCategory.OST_Stairs]),
        new(GameLayerIds.Ceiling, [BuiltInCategory.OST_Ceilings]),
        new(GameLayerIds.Roof, [BuiltInCategory.OST_Roofs]),
        // Everything else solid enough to bump into.
        new(GameLayerIds.Generic,
        [
            BuiltInCategory.OST_GenericModel,
            BuiltInCategory.OST_Furniture,
            BuiltInCategory.OST_Casework,
            BuiltInCategory.OST_SpecialityEquipment,
            BuiltInCategory.OST_StructuralFraming
        ])
    ];

    /// <summary>Every category any layer draws from, for one collector pass.</summary>
    public static List<BuiltInCategory> AllCategories()
    {
        var categories = new List<BuiltInCategory>();
        foreach (var layer in All)
        {
            foreach (var category in layer.Categories)
            {
                if (!categories.Contains(category)) categories.Add(category);
            }
        }
        return categories;
    }

    /// <summary>
    /// Which layer an element belongs to, or null if the game has no use for it.
    /// </summary>
    public static GameLayer? LayerFor(Element element)
    {
        var category = element.Category;
        if (category == null) return null;

        // Category.BuiltInCategory rather than casting Category.Id: ElementId.Value
        // only exists from Revit 2024, and this project still builds for R23.
        var builtIn = category.BuiltInCategory;

        // Walls first: both wall layers claim the same category, so the wall's
        // own function is what separates them.
        if (builtIn == BuiltInCategory.OST_Walls)
        {
            var exterior = IsExteriorWall(element);
            foreach (var layer in All)
            {
                if (layer.Walls == WallFilter.Exterior && exterior) return layer;
                if (layer.Walls == WallFilter.Interior && !exterior) return layer;
            }
            return null;
        }

        foreach (var layer in All)
        {
            foreach (var candidate in layer.Categories)
            {
                if (candidate == builtIn) return layer;
            }
        }
        return null;
    }

    private static bool IsExteriorWall(Element element)
    {
        if (element is not Wall wall) return true;
        // An unset function is the Revit default for a basic wall, and a wall
        // nobody classified is more likely to be part of the envelope than a
        // partition — the envelope is what the game needs most.
        return wall.WallType?.Function != WallFunction.Interior;
    }
}
