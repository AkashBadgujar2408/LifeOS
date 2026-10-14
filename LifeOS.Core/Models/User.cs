using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class User
{
    public int Id { get; set; }

    public string Email { get; set; } = null!;

    public string PasswordHash { get; set; } = null!;

    public string DisplayName { get; set; } = null!;

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public string Username { get; set; } = null!;

    public virtual ICollection<EntityLink> EntityLinks { get; set; } = new List<EntityLink>();

    public virtual ICollection<InboxItem> InboxItems { get; set; } = new List<InboxItem>();

    public virtual ICollection<Tag> Tags { get; set; } = new List<Tag>();
}
