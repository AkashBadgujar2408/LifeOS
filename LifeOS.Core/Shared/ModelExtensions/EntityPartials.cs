using LifeOS.Core.Shared.ModelExtensions;

namespace LifeOS.Core.Models;

public partial class User : ISoftDeletable;

public partial class Tag : ISoftDeletable, IUserOwned;

public partial class EntityLink : ISoftDeletable, IUserOwned;

public partial class LifeArea : ISoftDeletable;

public partial class InboxItem : ISoftDeletable, IUserOwned;

public partial class Goal : ISoftDeletable, IUserOwned;

public partial class GoalMilestone : ISoftDeletable, IUserOwned;

public partial class GoalTag : ISoftDeletable, IUserOwned;

public partial class GoalHistory : ISoftDeletable, IUserOwned;

public partial class Project : ISoftDeletable, IUserOwned;

public partial class TaskItem : ISoftDeletable, IUserOwned;

public partial class TaskTag : ISoftDeletable, IUserOwned;

public partial class Event : ISoftDeletable, IUserOwned;

public partial class Reminder : ISoftDeletable, IUserOwned;

public partial class Habit : ISoftDeletable, IUserOwned;

public partial class HabitEntry : ISoftDeletable, IUserOwned;
