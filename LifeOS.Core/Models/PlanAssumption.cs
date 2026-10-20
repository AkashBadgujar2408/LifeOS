using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class PlanAssumption
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public decimal ExpectedReturnPercent { get; set; }

    public decimal InflationPercent { get; set; }

    public DateOnly? BirthDate { get; set; }

    public int RetirementAge { get; set; }

    public int YearsInRetirement { get; set; }

    public decimal? MonthlySpending { get; set; }

    public decimal? MonthlySaving { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual User User { get; set; } = null!;
}
