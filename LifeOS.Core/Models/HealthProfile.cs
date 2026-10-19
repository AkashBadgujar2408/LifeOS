using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class HealthProfile
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public DateOnly? DateOfBirth { get; set; }

    public string? Sex { get; set; }

    public string? BloodGroup { get; set; }

    public decimal? HeightCm { get; set; }

    public bool? IsOrganDonor { get; set; }

    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual User User { get; set; } = null!;
}
