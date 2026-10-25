using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class MockInterview
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public int? JobApplicationId { get; set; }

    public DateOnly HeldOn { get; set; }

    public string Tool { get; set; } = null!;

    public int? DurationMinutes { get; set; }

    public string? Role { get; set; }

    public string? Rating { get; set; }

    public string? Strengths { get; set; }

    public string? Improvements { get; set; }

    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual JobApplication? JobApplication { get; set; }

    public virtual User User { get; set; } = null!;
}
