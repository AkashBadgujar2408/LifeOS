using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class Employment
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public string Organisation { get; set; } = null!;

    public string Role { get; set; } = null!;

    public string EmploymentType { get; set; } = null!;

    public string? Location { get; set; }

    public DateOnly StartDate { get; set; }

    public DateOnly? EndDate { get; set; }

    public string? Description { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual ICollection<CareerAchievement> CareerAchievements { get; set; } = new List<CareerAchievement>();

    public virtual ICollection<PerformanceReview> PerformanceReviews { get; set; } = new List<PerformanceReview>();

    public virtual ICollection<SalaryRecord> SalaryRecords { get; set; } = new List<SalaryRecord>();

    public virtual User User { get; set; } = null!;
}
