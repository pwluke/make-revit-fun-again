using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using BIM_Boom.Handlers;
using BIM_Boom.Models;
using BIM_Boom.Services;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;

namespace BIM_Boom.ViewModels;

public sealed partial class BIM_BoomViewModel : ObservableObject
{
    private readonly Autodesk.Revit.UI.UIDocument _uidoc;
    private readonly Document _doc;
    private readonly VoxelDirectContext3DServer _dc3dServer;
    private readonly DelegateExternalEventHandler _handler;
    private readonly Autodesk.Revit.UI.ExternalEvent _externalEvent;

    private MergedMesh? _mergedMesh;
    private List<VoxelData> _currentVoxels = [];
    private InstantDbClient? _instantClient;

    [ObservableProperty] private double _cellSize = 1.0;
    [ObservableProperty] private double _distanceThreshold = 0.5;
    [ObservableProperty] private int _maxVoxels = 30000;
    [ObservableProperty] private string _statusText = "Ready. Select elements and click 'Export & Voxelize'.";
    [ObservableProperty] private bool _isStreamEnabled;
    [ObservableProperty] private bool _isRecomputeEnabled;
    [ObservableProperty] private string _appId = "c9e94b2b-b3d9-45bd-957b-cebbedfbd732";
    [ObservableProperty] private string _adminToken = "4db681d1-497b-413a-bf94-e0e240b01f2e";
    [ObservableProperty] private int _voxelCount;

    public BIM_BoomViewModel(Autodesk.Revit.UI.UIDocument uidoc, VoxelDirectContext3DServer dc3dServer,
        DelegateExternalEventHandler handler, Autodesk.Revit.UI.ExternalEvent externalEvent)
    {
        _uidoc = uidoc;
        _doc = uidoc.Document;
        _dc3dServer = dc3dServer;
        _handler = handler;
        _externalEvent = externalEvent;
    }

    [RelayCommand]
    private void ExportAndVoxelize()
    {
        StatusText = "Reading selection...";

        _handler.SetAction(uiApp =>
        {
            try
            {
                var uidoc = uiApp.ActiveUIDocument;
                var doc = uidoc.Document;

                var ids = uidoc.Selection.GetElementIds();
                if (ids.Count == 0)
                {
                    StatusText = "No elements selected. Please select elements first.";
                    return;
                }

                StatusText = $"Extracting geometry from {ids.Count} elements...";

                // Read-only geometry extraction — no transactions needed
                var (mesh, grayCount) = RevitGeometryExtractor.ExtractGeometry(doc, ids);
                _mergedMesh = mesh;

                if (mesh.Vertices.Count == 0)
                {
                    StatusText = "No geometry found in selected elements.";
                    return;
                }

                if (grayCount > 0)
                {
                    StatusText = $"Extracted {mesh.Vertices.Count / 3} triangles ({grayCount} elements have no material — using gray). Voxelizing...";
                }
                else
                {
                    StatusText = $"Extracted {mesh.Vertices.Count / 3} triangles. Voxelizing...";
                }

                if (VoxelizationService.HasThinMemberWarning(mesh, CellSize))
                {
                    StatusText += " ⚠ Thin members may not register voxels at this cell size.";
                }

                // Voxelization is CPU-bound, run on background thread
                Task.Run(() => RunVoxelizationBackground());
            }
            catch (Exception ex)
            {
                StatusText = $"Export failed: {ex.Message}";
            }
        });

        _externalEvent.Raise();
    }

    private void RunVoxelizationBackground()
    {
        try
        {
            RunVoxelization();
        }
        catch (Exception ex)
        {
            StatusText = $"Voxelization failed: {ex.Message}";
        }
    }

    [RelayCommand]
    private void RecomputePreview()
    {
        if (_mergedMesh == null)
        {
            StatusText = "No mesh data — run Export & Voxelize first.";
            return;
        }

        StatusText = "Recomputing voxels...";
        Task.Run(() =>
        {
            try
            {
                RunVoxelization();
            }
            catch (Exception ex)
            {
                StatusText = $"Recompute failed: {ex.Message}";
            }
        });
    }

    private void RunVoxelization()
    {
        var parameters = new VoxelizationService.VoxelParams(CellSize, DistanceThreshold, MaxVoxels);
        var voxels = VoxelizationService.Voxelize(_mergedMesh!, parameters);
        _currentVoxels = voxels;
        VoxelCount = voxels.Count;
        IsStreamEnabled = voxels.Count > 0;
        IsRecomputeEnabled = true;

        StatusText = $"{voxels.Count} voxels ready. Updating preview...";

        // Update DC3D preview on the API thread
        _handler.SetAction(uiApp =>
        {
            _dc3dServer.UpdateVoxels(_currentVoxels);
            uiApp.ActiveUIDocument?.UpdateAllOpenViews();
            uiApp.ActiveUIDocument?.RefreshActiveView();
            StatusText = $"{_currentVoxels.Count} voxels displayed.";
        });
        _externalEvent.Raise();
    }

    [RelayCommand]
    private async Task StreamToWebApp()
    {
        if (_currentVoxels.Count == 0)
        {
            StatusText = "Nothing to stream — run Export & Voxelize first.";
            return;
        }

        IsStreamEnabled = false;
        StatusText = $"Streaming {_currentVoxels.Count} voxels to web app...";

        try
        {
            _instantClient ??= new InstantDbClient(AppId, AdminToken);
            await _instantClient.PushVoxelsAsync(_currentVoxels);
            StatusText = $"Streamed {_currentVoxels.Count} voxels successfully.";
        }
        catch (Exception ex)
        {
            StatusText = $"Stream failed: {ex.Message}";
        }
        finally
        {
            IsStreamEnabled = true;
        }
    }
}