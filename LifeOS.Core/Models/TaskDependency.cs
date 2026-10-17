using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class TaskDependency
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public int TaskItemId { get; set; }

    public int BlockedByTaskId { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual TaskItem BlockedByTask { get; set; } = null!;

    public virtual TaskItem TaskItem { get; set; } = null!;

    public virtual User User { get; set; } = null!;
}
