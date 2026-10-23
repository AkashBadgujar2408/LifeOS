using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class AssistantSetting
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public bool IsEnabled { get; set; }

    public string Model { get; set; } = null!;

    public string? ApiKeySecret { get; set; }

    public string? ApiKeyLast4 { get; set; }

    public DateTime? ApiKeySetAt { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual User User { get; set; } = null!;
}
