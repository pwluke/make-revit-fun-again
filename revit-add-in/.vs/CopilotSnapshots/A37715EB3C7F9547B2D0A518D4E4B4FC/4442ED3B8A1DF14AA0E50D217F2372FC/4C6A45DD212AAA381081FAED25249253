using Autodesk.Revit.Attributes;
using Autodesk.Revit.UI;
using BIM_Boom.Handlers;
using BIM_Boom.Services;
using BIM_Boom.ViewModels;
using BIM_Boom.Views;
using Nice3point.Revit.Toolkit.External;

namespace BIM_Boom.Commands;

/// <summary>
/// External command entry point. Creates the DC3D server (must happen here,
/// in the active external command context — never from the WPF thread or
/// inside an ExternalEvent handler) and shows the modeless voxelizer window.
/// </summary>
[UsedImplicitly]
[Transaction(TransactionMode.Manual)]
public class StartupCommand : ExternalCommand
{
    private static BIM_BoomView? _activeWindow;

    public override void Execute()
    {
        // If window already open, just bring to front
        if (_activeWindow is { IsLoaded: true })
        {
            _activeWindow.Activate();
            return;
        }

        // Create DC3D server on the API thread (required by Revit)
        var dc3dServer = new VoxelDirectContext3DServer(Document);
        dc3dServer.Register();

        // Create external event handler for API-thread callbacks
        var handler = new DelegateExternalEventHandler();
        var externalEvent = Autodesk.Revit.UI.ExternalEvent.Create(handler);

        var viewModel = new BIM_BoomViewModel(UiDocument, dc3dServer, handler, externalEvent);
        var view = new BIM_BoomView(viewModel);

        view.Closed += (_, _) =>
        {
            dc3dServer.Unregister();
            _activeWindow = null;
        };

        _activeWindow = view;
        view.Show(); // Modeless — not ShowDialog
    }
}