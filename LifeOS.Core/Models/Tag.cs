using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class Tag
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public string Name { get; set; } = null!;

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual ICollection<AssetTag> AssetTags { get; set; } = new List<AssetTag>();

    public virtual ICollection<BookTag> BookTags { get; set; } = new List<BookTag>();

    public virtual ICollection<Budget> Budgets { get; set; } = new List<Budget>();

    public virtual ICollection<ContactTag> ContactTags { get; set; } = new List<ContactTag>();

    public virtual ICollection<DocumentTag> DocumentTags { get; set; } = new List<DocumentTag>();

    public virtual ICollection<GoalTag> GoalTags { get; set; } = new List<GoalTag>();

    public virtual ICollection<HabitTag> HabitTags { get; set; } = new List<HabitTag>();

    public virtual ICollection<InterviewQuestionTag> InterviewQuestionTags { get; set; } = new List<InterviewQuestionTag>();

    public virtual ICollection<JournalEntryTag> JournalEntryTags { get; set; } = new List<JournalEntryTag>();

    public virtual ICollection<KnowledgeNoteTag> KnowledgeNoteTags { get; set; } = new List<KnowledgeNoteTag>();

    public virtual ICollection<RecurringTransactionTag> RecurringTransactionTags { get; set; } = new List<RecurringTransactionTag>();

    public virtual ICollection<SkillTag> SkillTags { get; set; } = new List<SkillTag>();

    public virtual ICollection<TaskTag> TaskTags { get; set; } = new List<TaskTag>();

    public virtual ICollection<TransactionTag> TransactionTags { get; set; } = new List<TransactionTag>();

    public virtual User User { get; set; } = null!;
}
