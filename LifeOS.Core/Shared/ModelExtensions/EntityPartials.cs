using LifeOS.Core.Shared.ModelExtensions;

namespace LifeOS.Core.Models;

public partial class User : ISoftDeletable;

public partial class Tag : ISoftDeletable, IUserOwned;

public partial class EntityLink : ISoftDeletable, IUserOwned;

public partial class LifeArea : ISoftDeletable;
