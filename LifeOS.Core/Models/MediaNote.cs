using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class MediaNote
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public int MediaItemId { get; set; }

    public string Kind { get; set; } = null!;

    public string Text { get; set; } = null!;

    public int? Page { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual MediaItem MediaItem { get; set; } = null!;

    public virtual User User { get; set; } = null!;
}
