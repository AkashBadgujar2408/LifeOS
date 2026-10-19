using System.Reflection;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.ServiceContracts;
using LifeOS.Core.Shared.Services;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Tests.Shared;

public class AccountDataTests
{
    [Fact]
    public void Principals_come_before_their_dependents_and_ties_keep_their_order()
    {
        var principals = new Dictionary<string, string[]>
        {
            ["Reminders"] = [],
            ["Documents"] = ["Reminders"],
            ["DocumentFiles"] = ["Documents"],
            ["Tasks"] = ["Tasks", "Projects"], // a self-reference doesn't block
            ["Projects"] = [],
        };
        var order = AccountData.InsertOrder(principals.Keys.ToList(), n => principals[n]);

        Assert.Equal(["Reminders", "Projects", "Documents", "Tasks", "DocumentFiles"], order);
    }

    [Fact]
    public void A_cycle_is_refused_rather_than_guessed()
    {
        var principals = new Dictionary<string, string[]> { ["A"] = ["B"], ["B"] = ["A"] };
        Assert.Throws<InvalidOperationException>(() => AccountData.InsertOrder(principals.Keys.ToList(), n => principals[n]));
    }

    [Fact]
    public void The_real_schema_has_an_insert_order()
    {
        using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlServer("Server=none;Database=none").Options);
        var tables = db.Model.GetEntityTypes().Where(e => e.FindProperty("UserId") is not null).ToList();
        var order = AccountData.InsertOrder(tables, t => t.GetForeignKeys().Select(fk => fk.PrincipalEntityType));

        Assert.Equal(tables.Count, order.Count);
        Assert.True(order.FindIndex(t => t.ClrType == typeof(Reminder)) < order.FindIndex(t => t.ClrType == typeof(Document)));
        Assert.True(order.FindIndex(t => t.ClrType == typeof(Account)) < order.FindIndex(t => t.ClrType == typeof(Transaction)));
    }

    [Fact]
    public void Every_linkable_type_names_a_model()
    {
        var providers = typeof(AccountData).Assembly.GetTypes()
            .Where(t => typeof(ILinkableEntityProvider).IsAssignableFrom(t) && t is { IsClass: true, IsAbstract: false })
            .ToList();
        Assert.NotEmpty(providers);
        foreach (var provider in providers)
        {
            var type = (string)provider.GetField("Type", BindingFlags.Public | BindingFlags.Static)!.GetValue(null)!;
            var model = typeof(AppDbContext).Assembly.GetType($"LifeOS.Core.Models.{AccountData.ModelTypeFor(type)}");
            Assert.True(model is not null, $"{type} has no model {AccountData.ModelTypeFor(type)}");
        }
    }

    [Fact]
    public void Csv_quotes_what_it_must_and_defuses_formulas()
    {
        var csv = AccountData.Csv(
            ["Id", "Title", "Due", "Amount", "Done"],
            [
                [1, "Pay rent, Oct", new DateOnly(2026, 10, 1), 12500.5m, false],
                [2, "=HYPERLINK(\"x\")", null, -3m, true],
                [3, "two\nlines", null, null, null],
            ]);

        Assert.Equal(
            "Id,Title,Due,Amount,Done\r\n" +
            "1,\"Pay rent, Oct\",2026-10-01,12500.5,false\r\n" +
            "2,\"'=HYPERLINK(\"\"x\"\")\",,-3,true\r\n" +
            "3,\"two\nlines\",,,\r\n",
            csv);
    }
}
