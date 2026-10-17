using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class UserHiddenModule
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public string ModuleKey { get; set; } = null!;

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual User User { get; set; } = null!;
}
