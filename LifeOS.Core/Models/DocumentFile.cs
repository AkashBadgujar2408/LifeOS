using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class DocumentFile
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public int DocumentId { get; set; }

    public string StoredName { get; set; } = null!;

    public string OriginalName { get; set; } = null!;

    public string ContentType { get; set; } = null!;

    public long SizeBytes { get; set; }

    public string Sha256 { get; set; } = null!;

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual Document Document { get; set; } = null!;

    public virtual User User { get; set; } = null!;
}
