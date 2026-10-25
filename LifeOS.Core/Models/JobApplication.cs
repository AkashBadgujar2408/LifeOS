using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class JobApplication
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public string Organisation { get; set; } = null!;

    public string Role { get; set; } = null!;

    public string Stage { get; set; } = null!;

    public DateOnly? AppliedOn { get; set; }

    public DateOnly? ClosedOn { get; set; }

    public string? Source { get; set; }

    public string? Url { get; set; }

    public int? ContactId { get; set; }

    public int? ResumeVersionId { get; set; }

    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual ICollection<ApplicationStageChange> ApplicationStageChanges { get; set; } = new List<ApplicationStageChange>();

    public virtual Contact? Contact { get; set; }

    public virtual ICollection<InterviewQuestion> InterviewQuestions { get; set; } = new List<InterviewQuestion>();

    public virtual ICollection<Interview> Interviews { get; set; } = new List<Interview>();

    public virtual ICollection<MockInterview> MockInterviews { get; set; } = new List<MockInterview>();

    public virtual ResumeVersion? ResumeVersion { get; set; }

    public virtual User User { get; set; } = null!;
}
