namespace BIM_Boom.Models;

/// <summary>
/// The layer names the web game loads, and nothing else — deliberately free of
/// any Revit reference, so the exporter and its tests can run outside Revit.
/// <para>
/// These are not free-form. They must match POINT_LAYERS in
/// <c>lib/use-grid-points.ts</c> exactly: the app fetches
/// <c>/{id}_voxels.json</c> for each one and colours it by id in
/// <c>lib/themes.ts</c>. The names follow the AIA CAD layer convention the
/// original hand-made export used.
/// </para>
/// </summary>
public static class GameLayerIds
{
    public const string Foundation = "S-FNDN";
    public const string Floor = "A-FLOR";
    public const string FloorOutline = "A-FLOR-OTLN";
    public const string ExteriorWall = "A-WALL";
    public const string InteriorWall = "I-WALL";
    public const string Column = "A-COLS";
    public const string Stairs = "S-STRS";
    public const string Ceiling = "A-CLNG";
    public const string Roof = "A-ROOF";
    public const string Generic = "A-GENM";

    /// <summary>In POINT_LAYERS order.</summary>
    public static readonly string[] All =
    [
        Foundation,
        Floor,
        FloorOutline,
        ExteriorWall,
        InteriorWall,
        Column,
        Stairs,
        Ceiling,
        Roof,
        Generic
    ];

    /// <summary>File name the web app fetches for a layer.</summary>
    public static string FileName(string layerId) => layerId + "_voxels.json";
}
