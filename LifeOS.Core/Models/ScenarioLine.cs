using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class ScenarioLine
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public int ScenarioId { get; set; }

    public string Kind { get; set; } = null!;

    public string Title { get; set; } = null!;

    public decimal Amount { get; set; }

    public DateOnly StartsOn { get; set; }

    public DateOnly? EndsOn { get; set; }

    public int? AccountId { get; set; }

    public decimal? AnnualRate { get; set; }

    public int? TermMonths { get; set; }

    public int SortOrder { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual Account? Account { get; set; }

    public virtual Scenario Scenario { get; set; } = null!;

    public virtual User User { get; set; } = null!;
}
