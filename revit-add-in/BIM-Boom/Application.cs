using BIM_Boom.Commands;
using Nice3point.Revit.Toolkit.External;

namespace BIM_Boom
{
    /// <summary>
    ///     Application entry point
    /// </summary>
    [UsedImplicitly]
    public class Application : ExternalApplication
    {
        public override void OnStartup()
        {
            CreateRibbon();
        }

        private void CreateRibbon()
        {
            var panel = Application.CreatePanel("Level Up", "BIM-Boom");

            panel.AddPushButton<StartupCommand>("Voxelize & Stream")
                .SetImage("/BIM-Boom;component/Resources/Icons/games16.png")
                .SetLargeImage("/BIM-Boom;component/Resources/Icons/games32.png");
        }
    }
}