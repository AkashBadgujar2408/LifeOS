using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class Document
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public string Title { get; set; } = null!;

    public string Kind { get; set; } = null!;

    public string? Issuer { get; set; }

    public string? NumberLast4 { get; set; }

    public DateOnly? IssuedOn { get; set; }

    public DateOnly? ExpiresOn { get; set; }

    public string? Notes { get; set; }

    public bool IsVault { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public int? ExpiryReminderDays { get; set; }

    public int? ExpiryReminderId { get; set; }

    public virtual ICollection<DocumentFile> DocumentFiles { get; set; } = new List<DocumentFile>();

    public virtual ICollection<DocumentTag> DocumentTags { get; set; } = new List<DocumentTag>();

    public virtual Reminder? ExpiryReminder { get; set; }

    public virtual User User { get; set; } = null!;
}
