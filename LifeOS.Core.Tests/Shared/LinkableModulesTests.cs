using System.Reflection;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using LifeOS.Core.Shared.Services;

namespace LifeOS.Core.Tests.Shared;

public class LinkableModulesTests
{
    [Fact]
    public void Every_linkable_type_says_which_module_it_belongs_to()
    {
        var providers = typeof(LinkableModules).Assembly.GetTypes()
            .Where(t => typeof(ILinkableEntityProvider).IsAssignableFrom(t) && t is { IsClass: true, IsAbstract: false })
            .ToList();
        Assert.NotEmpty(providers);
        foreach (var provider in providers)
        {
            var type = (string)provider.GetField("Type", BindingFlags.Public | BindingFlags.Static)!.GetValue(null)!;
            Assert.True(LinkableModules.ByType.ContainsKey(type), $"{type} has no entry in LinkableModules.ByType");
            Assert.True(LinkableModules.ByType[type] is null || ModuleKeys.All.Contains(LinkableModules.ByType[type]!),
                $"{type} names an unknown module");
        }
    }

    [Fact]
    public void A_switched_off_module_hides_its_items_and_shared_ones_always_show()
    {
        var hidden = new HashSet<string> { ModuleKeys.Health, ModuleKeys.Finance };

        Assert.False(LinkableModules.IsVisible("DoctorVisit", hidden));
        Assert.False(LinkableModules.IsVisible("Transaction", hidden));
        Assert.True(LinkableModules.IsVisible("Goal", hidden));
        Assert.True(LinkableModules.IsVisible("Contact", hidden));
        Assert.True(LinkableModules.IsVisible("InboxItem", hidden));
    }
}
