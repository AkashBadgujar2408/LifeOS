import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { Shell } from './core/layout/shell';
import { MyDay } from './features/dashboard/my-day';
import { ModulePlaceholderData } from './shared/components/module-placeholder/module-placeholder';

const loadPlaceholder = () =>
  import('./shared/components/module-placeholder/module-placeholder').then(
    (m) => m.ModulePlaceholder,
  );

// Each placeholder route is swapped for the real feature route when that module's session lands. Every Month 1 module
// is built now; exported so later-phase modules can use it again without it being flagged as unused meanwhile.
export const placeholder = (path: string, title: string, data: ModulePlaceholderData) => ({
  path,
  title: `${title} | LifeOS`,
  loadComponent: loadPlaceholder,
  data,
});

export const routes: Routes = [
  {
    path: 'login',
    title: 'Log in | LifeOS',
    loadComponent: () => import('./features/auth/login/login').then((m) => m.Login),
  },
  {
    path: 'register',
    title: 'Create account | LifeOS',
    loadComponent: () => import('./features/auth/register/register').then((m) => m.Register),
  },
  {
    path: 'reset-password',
    title: 'Reset password | LifeOS',
    loadComponent: () =>
      import('./features/auth/reset-password/reset-password').then((m) => m.ResetPassword),
  },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      { path: '', title: 'My Day | LifeOS', component: MyDay },
      {
        path: 'inbox',
        title: 'Inbox | LifeOS',
        loadComponent: () => import('./features/inbox/inbox').then((m) => m.Inbox),
      },
      {
        path: 'settings',
        title: 'Settings | LifeOS',
        loadComponent: () => import('./features/settings/settings').then((m) => m.Settings),
      },
      {
        path: 'tags',
        title: 'Tags | LifeOS',
        loadComponent: () => import('./features/tags/tags').then((m) => m.Tags),
      },
      {
        path: 'calendar',
        title: 'Calendar | LifeOS',
        loadComponent: () => import('./features/calendar/calendar').then((m) => m.Calendar),
      },
      {
        path: 'reminders',
        title: 'Reminders | LifeOS',
        loadComponent: () => import('./features/reminders/reminders').then((m) => m.Reminders),
      },
      {
        path: 'goals',
        title: 'Goals | LifeOS',
        loadComponent: () => import('./features/goals/goals').then((m) => m.Goals),
      },
      {
        path: 'goals/new',
        title: 'New goal | LifeOS',
        loadComponent: () => import('./features/goals/goal-form').then((m) => m.GoalForm),
      },
      {
        path: 'goals/:id',
        title: 'Goal | LifeOS',
        loadComponent: () => import('./features/goals/goal-detail').then((m) => m.GoalDetail),
      },
      {
        path: 'goals/:id/edit',
        title: 'Revise goal | LifeOS',
        loadComponent: () => import('./features/goals/goal-form').then((m) => m.GoalForm),
      },
      {
        path: 'tasks',
        title: 'Tasks | LifeOS',
        loadComponent: () => import('./features/tasks/tasks').then((m) => m.Tasks),
      },
      {
        path: 'projects',
        title: 'Projects | LifeOS',
        loadComponent: () => import('./features/projects/projects').then((m) => m.Projects),
      },
      {
        path: 'projects/:id',
        title: 'Project | LifeOS',
        loadComponent: () =>
          import('./features/projects/project-detail').then((m) => m.ProjectDetail),
      },
      {
        path: 'habits',
        title: 'Habits | LifeOS',
        loadComponent: () => import('./features/habits/habits').then((m) => m.Habits),
      },
      { path: 'learning', redirectTo: 'learning/skills', pathMatch: 'full' },
      {
        path: 'learning/skills',
        title: 'Skills | LifeOS',
        loadComponent: () => import('./features/learning/skills').then((m) => m.Skills),
      },
      {
        path: 'learning/skills/:id',
        title: 'Skill | LifeOS',
        loadComponent: () => import('./features/learning/skill-detail').then((m) => m.SkillDetail),
      },
      {
        path: 'learning/courses',
        title: 'Courses | LifeOS',
        loadComponent: () => import('./features/learning/courses').then((m) => m.Courses),
      },
      {
        path: 'learning/books',
        title: 'Reading | LifeOS',
        loadComponent: () => import('./features/learning/books').then((m) => m.Books),
      },
      {
        path: 'learning/books/:id',
        title: 'Book | LifeOS',
        loadComponent: () => import('./features/learning/book-detail').then((m) => m.BookDetail),
      },
      {
        path: 'learning/roadmaps',
        title: 'Roadmaps | LifeOS',
        loadComponent: () => import('./features/learning/roadmaps').then((m) => m.Roadmaps),
      },
      {
        path: 'learning/roadmaps/:id',
        title: 'Roadmap | LifeOS',
        loadComponent: () =>
          import('./features/learning/roadmap-detail').then((m) => m.RoadmapDetail),
      },
      {
        path: 'learning/study',
        title: 'Study | LifeOS',
        loadComponent: () => import('./features/learning/study').then((m) => m.Study),
      },
      {
        path: 'learning/notes',
        title: 'Notes & review | LifeOS',
        loadComponent: () => import('./features/learning/notes').then((m) => m.Notes),
      },
      {
        path: 'learning/certifications',
        title: 'Certifications | LifeOS',
        loadComponent: () =>
          import('./features/learning/certifications').then((m) => m.Certifications),
      },
      {
        path: 'career',
        title: 'Career | LifeOS',
        loadComponent: () => import('./features/career/timeline').then((m) => m.CareerTimeline),
      },
      {
        path: 'career/salary',
        title: 'Salary history | LifeOS',
        loadComponent: () => import('./features/career/salary').then((m) => m.CareerSalary),
      },
      {
        path: 'career/achievements',
        title: 'Achievements | LifeOS',
        loadComponent: () =>
          import('./features/career/achievements').then((m) => m.CareerAchievements),
      },
      {
        path: 'career/applications',
        title: 'Applications | LifeOS',
        loadComponent: () =>
          import('./features/career/applications').then((m) => m.CareerApplications),
      },
      {
        path: 'career/applications/:id',
        title: 'Application | LifeOS',
        loadComponent: () =>
          import('./features/career/application-detail').then((m) => m.ApplicationDetail),
      },
      {
        path: 'career/questions',
        title: 'Interview prep | LifeOS',
        loadComponent: () => import('./features/career/questions').then((m) => m.CareerQuestions),
      },
      {
        path: 'career/resumes',
        title: 'Resumes | LifeOS',
        loadComponent: () => import('./features/career/resumes').then((m) => m.CareerResumes),
      },
      {
        path: 'career/reviews',
        title: 'Performance reviews | LifeOS',
        loadComponent: () => import('./features/career/reviews').then((m) => m.CareerReviews),
      },
      {
        path: 'career/side-income',
        title: 'Side income | LifeOS',
        loadComponent: () =>
          import('./features/career/side-income').then((m) => m.CareerSideIncome),
      },
      {
        path: 'career/network',
        title: 'Network | LifeOS',
        loadComponent: () => import('./features/career/network').then((m) => m.CareerNetwork),
      },
      {
        path: 'finance',
        title: 'Accounts | LifeOS',
        loadComponent: () => import('./features/finance/accounts').then((m) => m.FinanceAccounts),
      },
      {
        path: 'finance/transactions',
        title: 'Transactions | LifeOS',
        loadComponent: () => import('./features/finance/ledger').then((m) => m.FinanceLedger),
      },
      {
        path: 'finance/recurring',
        title: 'Repeating | LifeOS',
        loadComponent: () => import('./features/finance/recurring').then((m) => m.FinanceRecurring),
      },
      {
        path: 'finance/budgets',
        title: 'Budgets | LifeOS',
        loadComponent: () => import('./features/finance/budgets').then((m) => m.FinanceBudgets),
      },
      {
        path: 'finance/net-worth',
        title: 'Net worth | LifeOS',
        loadComponent: () => import('./features/finance/net-worth').then((m) => m.FinanceNetWorth),
      },
      {
        path: 'finance/investments',
        title: 'Investments | LifeOS',
        loadComponent: () =>
          import('./features/finance/investments').then((m) => m.FinanceInvestments),
      },
      {
        path: 'finance/loans',
        title: 'Loans | LifeOS',
        loadComponent: () => import('./features/finance/loans').then((m) => m.FinanceLoans),
      },
      {
        path: 'finance/loans/:id',
        title: 'Loan | LifeOS',
        loadComponent: () => import('./features/finance/loan-detail').then((m) => m.LoanDetail),
      },
      {
        path: 'finance/insurance',
        title: 'Insurance | LifeOS',
        loadComponent: () => import('./features/finance/insurance').then((m) => m.FinanceInsurance),
      },
      {
        path: 'finance/taxes',
        title: 'Taxes | LifeOS',
        loadComponent: () => import('./features/finance/taxes').then((m) => m.FinanceTaxes),
      },
      {
        path: 'finance/reports',
        title: 'Money reports | LifeOS',
        loadComponent: () => import('./features/finance/reports').then((m) => m.FinanceReports),
      },
      {
        path: 'finance/import',
        title: 'Import a statement | LifeOS',
        loadComponent: () =>
          import('./features/finance/statement-import').then((m) => m.StatementImport),
      },
      {
        path: 'health',
        title: 'Health | LifeOS',
        loadComponent: () => import('./features/health/health').then((m) => m.Health),
      },
      {
        path: 'health/history',
        title: 'Medical history | LifeOS',
        loadComponent: () => import('./features/health/history').then((m) => m.HealthHistory),
      },
      {
        path: 'health/visits',
        title: 'Doctor visits | LifeOS',
        loadComponent: () => import('./features/health/visits').then((m) => m.HealthVisits),
      },
      {
        path: 'health/medications',
        title: 'Medicines | LifeOS',
        loadComponent: () =>
          import('./features/health/medications').then((m) => m.HealthMedications),
      },
      {
        path: 'health/fitness',
        title: 'Exercise | LifeOS',
        loadComponent: () => import('./features/health/fitness').then((m) => m.HealthFitness),
      },
      {
        path: 'health/sleep',
        title: 'Sleep | LifeOS',
        loadComponent: () => import('./features/health/sleep').then((m) => m.HealthSleep),
      },
      {
        path: 'health/body',
        title: 'Body | LifeOS',
        loadComponent: () => import('./features/health/body').then((m) => m.HealthBody),
      },
      {
        path: 'health/nutrition',
        title: 'Food & water | LifeOS',
        loadComponent: () => import('./features/health/nutrition').then((m) => m.HealthNutrition),
      },
      {
        path: 'health/labs',
        title: 'Lab results | LifeOS',
        loadComponent: () => import('./features/health/labs').then((m) => m.HealthLabs),
      },
      {
        path: 'health/wellness',
        title: 'Wellbeing | LifeOS',
        loadComponent: () => import('./features/health/wellness').then((m) => m.HealthWellness),
      },
      {
        path: 'home',
        title: 'Home & assets | LifeOS',
        loadComponent: () => import('./features/home/home-overview').then((m) => m.HomeOverview),
      },
      {
        path: 'home/inventory',
        title: 'Inventory | LifeOS',
        loadComponent: () => import('./features/home/inventory').then((m) => m.HomeInventory),
      },
      {
        path: 'home/vehicles',
        title: 'Vehicles | LifeOS',
        loadComponent: () => import('./features/home/vehicles').then((m) => m.HomeVehicles),
      },
      {
        path: 'home/vehicles/:id/fuel',
        title: 'Fuel | LifeOS',
        loadComponent: () => import('./features/home/fuel-log').then((m) => m.HomeFuelLog),
      },
      {
        path: 'home/warranties',
        title: 'Warranties | LifeOS',
        loadComponent: () => import('./features/home/warranties').then((m) => m.HomeWarranties),
      },
      {
        path: 'home/bills',
        title: 'Bills | LifeOS',
        loadComponent: () => import('./features/home/bills').then((m) => m.HomeBills),
      },
      {
        path: 'home/projects',
        title: 'Household projects | LifeOS',
        loadComponent: () =>
          import('./features/home/household-projects').then((m) => m.HomeHouseholdProjects),
      },
      {
        path: 'home/maintenance',
        title: 'Maintenance | LifeOS',
        loadComponent: () => import('./features/home/maintenance').then((m) => m.HomeMaintenance),
      },
      {
        path: 'documents',
        title: 'Documents | LifeOS',
        loadComponent: () => import('./features/documents/documents').then((m) => m.Documents),
      },
      {
        path: 'documents/:id',
        title: 'Document | LifeOS',
        loadComponent: () =>
          import('./features/documents/document-detail').then((m) => m.DocumentDetail),
      },
      {
        path: 'habits/:id',
        title: 'Habit | LifeOS',
        loadComponent: () => import('./features/habits/habit-detail').then((m) => m.HabitDetail),
      },
      {
        path: 'journal',
        title: 'Journal | LifeOS',
        loadComponent: () => import('./features/journal/journal').then((m) => m.Journal),
      },
      // Before 'journal/:date', so "week", "month" and "decisions" aren't read as dates.
      {
        path: 'journal/decisions',
        title: 'Decisions | LifeOS',
        loadComponent: () => import('./features/journal/decisions').then((m) => m.Decisions),
      },
      {
        path: 'journal/month',
        title: 'Monthly reflection | LifeOS',
        loadComponent: () =>
          import('./features/journal/monthly-reflection').then((m) => m.MonthlyReflection),
      },
      {
        path: 'journal/month/:month',
        title: 'Monthly reflection | LifeOS',
        loadComponent: () =>
          import('./features/journal/monthly-reflection').then((m) => m.MonthlyReflection),
      },
      {
        path: 'journal/week',
        title: 'Weekly reflection | LifeOS',
        loadComponent: () =>
          import('./features/journal/weekly-reflection').then((m) => m.WeeklyReflection),
      },
      {
        path: 'journal/week/:weekStart',
        title: 'Weekly reflection | LifeOS',
        loadComponent: () =>
          import('./features/journal/weekly-reflection').then((m) => m.WeeklyReflection),
      },
      {
        path: 'journal/:date',
        title: 'Journal | LifeOS',
        loadComponent: () => import('./features/journal/journal').then((m) => m.Journal),
      },
      {
        path: 'story',
        title: 'Your story | LifeOS',
        loadComponent: () => import('./features/story/story').then((m) => m.Story),
      },
      {
        path: 'missions',
        title: 'Missions | LifeOS',
        loadComponent: () => import('./features/story/missions').then((m) => m.Missions),
      },
      {
        path: 'life-areas',
        title: 'Life areas | LifeOS',
        loadComponent: () => import('./features/story/life-areas').then((m) => m.LifeAreas),
      },
      {
        path: 'achievements',
        title: 'Achievements | LifeOS',
        loadComponent: () => import('./features/story/achievements').then((m) => m.Achievements),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
