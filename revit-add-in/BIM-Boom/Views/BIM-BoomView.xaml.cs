using BIM_Boom.ViewModels;

namespace BIM_Boom.Views;

public sealed partial class BIM_BoomView
{
    public BIM_BoomView(BIM_BoomViewModel viewModel)
    {
        DataContext = viewModel;
        InitializeComponent();
    }
}