namespace LifeOS.Core.Shared.ModelExtensions;

public interface ISoftDeletable
{
    bool IsDeleted { get; set; }
    DateTime? DeletedAt { get; set; }
}
