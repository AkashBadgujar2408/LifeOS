using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class InterviewQuestion
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public int? JobApplicationId { get; set; }

    public string Question { get; set; } = null!;

    public string? Answer { get; set; }

    public string? ReviewNotes { get; set; }

    public DateOnly? LastPractisedOn { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual ICollection<InterviewQuestionTag> InterviewQuestionTags { get; set; } = new List<InterviewQuestionTag>();

    public virtual JobApplication? JobApplication { get; set; }

    public virtual User User { get; set; } = null!;
}
