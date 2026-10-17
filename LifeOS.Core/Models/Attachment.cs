using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class Attachment
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public string EntityType { get; set; } = null!;

    public int EntityId { get; set; }

    public string StoredName { get; set; } = null!;

    public string OriginalName { get; set; } = null!;

    public string ContentType { get; set; } = null!;

    public long SizeBytes { get; set; }

    public string Sha256 { get; set; } = null!;

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual User User { get; set; } = null!;
}
