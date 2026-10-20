using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class GiftIdea
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public int ContactId { get; set; }

    public string Title { get; set; } = null!;

    public int? SignificantDateId { get; set; }

    public string? Occasion { get; set; }

    public string Status { get; set; } = null!;

    public decimal? EstimatedAmount { get; set; }

    public string? Currency { get; set; }

    public string? Link { get; set; }

    public int? PurchaseId { get; set; }

    public DateOnly? GivenOn { get; set; }

    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual Contact Contact { get; set; } = null!;

    public virtual Purchase? Purchase { get; set; }

    public virtual SignificantDate? SignificantDate { get; set; }

    public virtual User User { get; set; } = null!;
}
