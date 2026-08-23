using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json;
using System.Threading.Tasks;
using BIM_Boom.Models;

namespace BIM_Boom.Services;

/// <summary>
/// Streams voxel data to the InstantDB-backed web app (Stage F).
/// Converts Revit Z-up coordinates to three.js Y-up before sending.
/// </summary>
public class InstantDbClient
{
    private const string BaseUrl = "https://api.instantdb.com";
    private const int BatchSize = 100;

    private readonly HttpClient _http;
    private readonly string _appId;

    public InstantDbClient(string appId, string adminToken)
    {
        _appId = appId;
        _http = new HttpClient();
        _http.DefaultRequestHeaders.Add("Authorization", $"Bearer {adminToken}");
        _http.Timeout = TimeSpan.FromSeconds(30);
    }

    /// <summary>
    /// Push voxels to the web app. Coordinates are converted from Revit Z-up to three.js Y-up.
    /// Batched in groups of 100 per InstantDB admin transact limits.
    /// </summary>
    public async Task PushVoxelsAsync(List<VoxelData> voxels)
    {
        var steps = voxels.Select(v =>
        {
            // Revit Z-up → three.js Y-up: rotate -90° about X → (x, z, -y)
            var (tx, ty, tz) = ToThreeJs(v.X, v.Y, v.Z);
            return new object[]
            {
                "update", "voxels", Guid.NewGuid().ToString(),
                new Dictionary<string, object>
                {
                    ["x"] = tx,
                    ["y"] = ty,
                    ["z"] = tz,
                    ["r"] = v.R,
                    ["g"] = v.G,
                    ["b"] = v.B,
                    ["a"] = v.A,
                    ["size"] = v.Size,
                    ["updatedAt"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
                }
            };
        }).ToList();

        for (int i = 0; i < steps.Count; i += BatchSize)
        {
            var batch = steps.Skip(i).Take(BatchSize).ToList();
            await TransactAsync(batch);
        }
    }

    /// <summary>
    /// Clear all voxels from the web app.
    /// </summary>
    public async Task ClearVoxelsAsync()
    {
        var queryPayload = new { query = new { voxels = new object() } };
        var result = await PostAsync("/admin/query", queryPayload);

        if (result.RootElement.TryGetProperty("voxels", out var voxelsArray))
        {
            var deleteSteps = new List<object[]>();
            foreach (var row in voxelsArray.EnumerateArray())
            {
                if (row.TryGetProperty("id", out var idProp))
                {
                    deleteSteps.Add(["delete", "voxels", idProp.GetString()!]);
                }
            }

            for (int i = 0; i < deleteSteps.Count; i += BatchSize)
            {
                var batch = deleteSteps.Skip(i).Take(BatchSize).ToList();
                await TransactAsync(batch);
            }
        }
    }

    private async Task TransactAsync(List<object[]> steps)
    {
        var payload = new { steps };
        await PostAsync("/admin/transact", payload);
    }

    private async Task<JsonDocument> PostAsync(string endpoint, object payload)
    {
        var content = JsonContent.Create(payload);
        content.Headers.Add("App-Id", _appId);

        var response = await _http.PostAsync(BaseUrl + endpoint, content);
        response.EnsureSuccessStatusCode();

        var json = await response.Content.ReadAsStringAsync();
        return JsonDocument.Parse(json);
    }

    /// <summary>
    /// Revit Z-up/right-handed feet → three.js Y-up: rotate -90° about X.
    /// </summary>
    private static (double X, double Y, double Z) ToThreeJs(double x, double y, double z)
    {
        return (x, z, -y);
    }
}
