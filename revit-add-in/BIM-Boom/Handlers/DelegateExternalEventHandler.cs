using System;
using Autodesk.Revit.UI;

namespace BIM_Boom.Handlers;

/// <summary>
/// Generic external event handler that executes a delegate on the Revit API thread.
/// Used to marshal IFC export, DC3D mesh updates, and view refreshes back to the API context.
/// </summary>
public class DelegateExternalEventHandler : IExternalEventHandler
{
    private Action<UIApplication>? _action;
    private readonly object _lock = new();

    public string GetName() => "BIM-Boom Delegate Handler";

    /// <summary>
    /// Set the action to execute on next Raise().
    /// </summary>
    public void SetAction(Action<UIApplication> action)
    {
        lock (_lock)
        {
            _action = action;
        }
    }

    public void Execute(UIApplication app)
    {
        Action<UIApplication>? action;
        lock (_lock)
        {
            action = _action;
            _action = null;
        }

        action?.Invoke(app);
    }
}
