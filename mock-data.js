'use strict';

/**
 * In-memory mock data for TalentHub Employer portal.
 * New requisitions and stage changes persist via localStorage (see app.js).
 */

const STORAGE_KEYS = {
  REQUISITIONS: 'talenthub-requisitions',
  CANDIDATE_STAGES: 'talenthub-candidate-stages',
  ACTIVE_SECTION: 'talenthub-active-section'
};

const DEFAULT_REQUISITIONS = [
  {
    id: 'REQ-1048',
    jobTitle: 'Senior Product Designer',
    location: 'Sydney',
    state: 'NSW',
    workplaceType: 'Hybrid',
    hiringManager: 'Olivia Chen',
    recruiter: 'James Porter',
    department: 'Product',
    employmentType: 'Full-time',
    applicants: 42,
    shortlisted: 12,
    status: 'Active',
    postedDate: '2026-05-12',
    closingDate: '2026-07-28',
    jobSummary: 'Lead end-to-end product design for our employer platform.',
    responsibilities: 'Own design system evolution, run discovery workshops, partner with engineering.',
    requirements: '7+ years product design, Figma expertise, B2B SaaS experience.',
    salaryRange: '$140,000 – $165,000'
  },
  {
    id: 'REQ-1051',
    jobTitle: 'Customer Success Manager',
    location: 'Melbourne',
    state: 'VIC',
    workplaceType: 'On-site',
    hiringManager: 'Marcus Lee',
    recruiter: 'Priya Shah',
    department: 'Customer Success',
    employmentType: 'Full-time',
    applicants: 28,
    shortlisted: 8,
    status: 'Active',
    postedDate: '2026-05-18',
    closingDate: '2026-08-05',
    jobSummary: 'Drive retention and expansion for mid-market employer accounts.',
    responsibilities: 'Own account health, onboarding, QBRs, and upsell motions.',
    requirements: '5+ years CSM experience, SaaS background, strong stakeholder skills.',
    salaryRange: '$95,000 – $115,000'
  },
  {
    id: 'REQ-1055',
    jobTitle: 'Senior Software Engineer',
    location: 'Remote',
    state: '',
    workplaceType: 'Remote',
    hiringManager: 'Priya Shah',
    recruiter: 'Daniel Morgan',
    department: 'Engineering',
    employmentType: 'Full-time',
    applicants: 67,
    shortlisted: 18,
    status: 'Active',
    postedDate: '2026-04-30',
    closingDate: '2026-07-20',
    jobSummary: 'Build scalable services powering recruitment workflows.',
    responsibilities: 'Design APIs, improve reliability, mentor engineers.',
    requirements: 'Strong TypeScript/Node or Java, distributed systems, CI/CD.',
    salaryRange: '$150,000 – $180,000'
  },
  {
    id: 'REQ-1060',
    jobTitle: 'Finance Business Partner',
    location: 'Sydney',
    state: 'NSW',
    workplaceType: 'Hybrid',
    hiringManager: 'Daniel Morgan',
    recruiter: 'Sarah Wilson',
    department: 'Finance',
    employmentType: 'Full-time',
    applicants: 19,
    shortlisted: 4,
    status: 'Draft',
    postedDate: null,
    closingDate: '2026-08-15',
    jobSummary: 'Partner with business units on forecasting and investment decisions.',
    responsibilities: 'Monthly reporting, budget planning, commercial analysis.',
    requirements: 'CA/CPA, FP&A experience, strong Excel and BI tools.',
    salaryRange: '$120,000 – $140,000'
  },
  {
    id: 'REQ-1063',
    jobTitle: 'Marketing Operations Lead',
    location: 'Brisbane',
    state: 'QLD',
    workplaceType: 'Hybrid',
    hiringManager: 'Sarah Wilson',
    recruiter: 'Olivia Chen',
    department: 'Marketing',
    employmentType: 'Full-time',
    applicants: 30,
    shortlisted: 9,
    status: 'Closing soon',
    postedDate: '2026-04-10',
    closingDate: '2026-07-18',
    jobSummary: 'Own marketing automation, attribution, and campaign operations.',
    responsibilities: 'HubSpot admin, lead routing, reporting dashboards.',
    requirements: 'Marketing ops leadership, CRM expertise, analytics mindset.',
    salaryRange: '$110,000 – $130,000'
  }
];

const DEFAULT_CANDIDATES = [
  {
    id: 'CAND-2001',
    name: 'Maya Patel',
    currentTitle: 'Lead Product Designer',
    location: 'Sydney',
    email: 'maya.patel@email.example',
    phone: '+61 412 345 678',
    match: 94,
    stage: 'Shortlisted',
    requisitionId: 'REQ-1048',
    appliedFor: 'Senior Product Designer',
    appliedDate: '2026-06-02',
    lastActivity: '2026-07-10',
    experience: '9 years',
    skills: ['Figma', 'Design systems', 'User research', 'Prototyping'],
    summary: 'Product design leader with deep B2B SaaS experience and a track record of shipping employer-facing workflows.',
    workHistory: [
      { role: 'Lead Product Designer', company: 'Flowstack', years: '2021 – Present' },
      { role: 'Senior UX Designer', company: 'BrightHire', years: '2017 – 2021' }
    ],
    education: [{ degree: 'BDes, Interaction Design', school: 'UTS', years: '2015' }],
    applicationAnswers: [
      { question: 'Why this role?', answer: 'I want to shape hiring experiences that feel human and efficient.' },
      { question: 'Portfolio link', answer: 'https://portfolio.example/maya' }
    ],
    aiSummary: {
      strengths: ['Strong portfolio in complex workflows', 'Clear design system experience', 'Excellent stakeholder communication'],
      gaps: ['Limited public sector experience', 'No formal people-management history'],
      questions: ['Walk us through a design system decision you reversed.', 'How do you prioritise research with tight release cycles?']
    }
  },
  {
    id: 'CAND-2002',
    name: 'Liam Thompson',
    currentTitle: 'Senior UX Designer',
    location: 'Melbourne',
    email: 'liam.thompson@email.example',
    phone: '+61 423 456 789',
    match: 89,
    stage: 'Interview',
    requisitionId: 'REQ-1048',
    appliedFor: 'Senior Product Designer',
    appliedDate: '2026-06-08',
    lastActivity: '2026-07-12',
    experience: '7 years',
    skills: ['Figma', 'Accessibility', 'Workshop facilitation'],
    summary: 'Hands-on designer focused on accessible, inclusive product experiences.',
    workHistory: [
      { role: 'Senior UX Designer', company: 'TalentForge', years: '2020 – Present' },
      { role: 'UX Designer', company: 'RetailCo', years: '2018 – 2020' }
    ],
    education: [{ degree: 'BA, Digital Media', school: 'RMIT', years: '2017' }],
    applicationAnswers: [
      { question: 'Why this role?', answer: 'Northstar Digital\'s product mission aligns with my accessibility focus.' }
    ],
    aiSummary: {
      strengths: ['Accessibility expertise', 'Strong workshop facilitation', 'Solid visual craft'],
      gaps: ['Less experience with design ops at scale'],
      questions: ['Describe an accessibility audit that changed your roadmap.', 'How do you collaborate with PM on scope?']
    }
  },
  {
    id: 'CAND-2003',
    name: 'Sofia Nguyen',
    currentTitle: 'Customer Success Lead',
    location: 'Sydney',
    email: 'sofia.nguyen@email.example',
    phone: '+61 434 567 890',
    match: 91,
    stage: 'Screening',
    requisitionId: 'REQ-1051',
    appliedFor: 'Customer Success Manager',
    appliedDate: '2026-06-15',
    lastActivity: '2026-07-11',
    experience: '6 years',
    skills: ['Account management', 'QBRs', 'Salesforce', 'Churn analysis'],
    summary: 'Customer success leader with a data-driven approach to retention.',
    workHistory: [
      { role: 'CS Lead', company: 'CloudHire', years: '2022 – Present' },
      { role: 'CSM', company: 'SaaSify', years: '2019 – 2022' }
    ],
    education: [{ degree: 'BCom, Marketing', school: 'UNSW', years: '2018' }],
    applicationAnswers: [
      { question: 'Largest account managed?', answer: '$1.2M ARR portfolio across 18 accounts.' }
    ],
    aiSummary: {
      strengths: ['Proven retention metrics', 'Executive stakeholder management'],
      gaps: ['Limited experience in recruitment vertical'],
      questions: ['How do you identify expansion opportunities in a book of business?', 'Tell us about turning around an at-risk account.']
    }
  },
  {
    id: 'CAND-2004',
    name: 'Ethan Williams',
    currentTitle: 'Software Engineer',
    location: 'Brisbane',
    email: 'ethan.williams@email.example',
    phone: '+61 445 678 901',
    match: 87,
    stage: 'Screening',
    requisitionId: 'REQ-1055',
    appliedFor: 'Senior Software Engineer',
    appliedDate: '2026-06-20',
    lastActivity: '2026-07-09',
    experience: '8 years',
    skills: ['TypeScript', 'Node.js', 'AWS', 'PostgreSQL'],
    summary: 'Backend engineer specialising in reliable API platforms.',
    workHistory: [
      { role: 'Senior Engineer', company: 'DataPulse', years: '2021 – Present' },
      { role: 'Software Engineer', company: 'FinServe', years: '2017 – 2021' }
    ],
    education: [{ degree: 'BSc, Computer Science', school: 'UQ', years: '2016' }],
    applicationAnswers: [
      { question: 'Favourite technical challenge?', answer: 'Rebuilt event pipeline to cut p99 latency by 40%.' }
    ],
    aiSummary: {
      strengths: ['Strong backend fundamentals', 'Cloud-native experience'],
      gaps: ['Limited frontend depth', 'No direct recruitment domain exposure'],
      questions: ['How do you approach service decomposition?', 'Describe a production incident you led.']
    }
  },
  {
    id: 'CAND-2005',
    name: 'Chloe Martin',
    currentTitle: 'Marketing Ops Manager',
    location: 'Melbourne',
    email: 'chloe.martin@email.example',
    phone: '+61 456 789 012',
    match: 84,
    stage: 'New',
    requisitionId: 'REQ-1063',
    appliedFor: 'Marketing Operations Lead',
    appliedDate: '2026-07-01',
    lastActivity: '2026-07-08',
    experience: '5 years',
    skills: ['HubSpot', 'Marketo', 'Attribution', 'SQL'],
    summary: 'Marketing operations specialist with a passion for clean data and automation.',
    workHistory: [
      { role: 'Marketing Ops Manager', company: 'GrowthLane', years: '2022 – Present' },
      { role: 'Marketing Coordinator', company: 'BrandWave', years: '2020 – 2022' }
    ],
    education: [{ degree: 'BA, Communications', school: 'Monash', years: '2019' }],
    applicationAnswers: [
      { question: 'Automation highlight?', answer: 'Built lead scoring model that improved MQL conversion by 22%.' }
    ],
    aiSummary: {
      strengths: ['Marketing automation depth', 'Analytics fluency'],
      gaps: ['Smaller team leadership scope to date'],
      questions: ['How do you maintain data hygiene across CRM and MAP?', 'Describe a campaign ops failure and fix.']
    }
  },
  {
    id: 'CAND-2006',
    name: 'Noah Singh',
    currentTitle: 'Financial Analyst',
    location: 'Sydney',
    email: 'noah.singh@email.example',
    phone: '+61 467 890 123',
    match: 82,
    stage: 'New',
    requisitionId: 'REQ-1060',
    appliedFor: 'Finance Business Partner',
    appliedDate: '2026-07-05',
    lastActivity: '2026-07-07',
    experience: '6 years',
    skills: ['FP&A', 'Excel', 'Power BI', 'Forecasting'],
    summary: 'Finance professional with strong commercial partnering skills.',
    workHistory: [
      { role: 'Senior Financial Analyst', company: 'ScaleUp Co', years: '2021 – Present' },
      { role: 'Financial Analyst', company: 'RetailGroup', years: '2019 – 2021' }
    ],
    education: [{ degree: 'BCom, Finance', school: 'Macquarie', years: '2018' }],
    applicationAnswers: [
      { question: 'CPA status', answer: 'CPA qualified, 2023.' }
    ],
    aiSummary: {
      strengths: ['Solid FP&A toolkit', 'Clear commercial storytelling'],
      gaps: ['Limited experience in high-growth SaaS'],
      questions: ['How do you partner with non-finance leaders on budget trade-offs?', 'Walk through a forecast you had to revise mid-quarter.']
    }
  }
];

const PIPELINE_STAGES = ['Applied', 'Screening', 'Shortlisted', 'Interview', 'Offer', 'Hired'];

const PIPELINE_COUNTS = {
  Applied: 186,
  Screening: 82,
  Shortlisted: 41,
  Interview: 24,
  Offer: 8,
  Hired: 5
};

const KANBAN_STAGES = ['New', 'Screening', 'Shortlisted', 'Interview', 'Offer'];

const REQUISITION_STATUSES = ['Draft', 'Active', 'Paused', 'Closing soon', 'Closed'];

const CANDIDATE_STAGES = ['New', 'Screening', 'Shortlisted', 'Interview', 'Offer', 'Hired', 'Archived'];

const LOCATIONS = ['Sydney', 'Melbourne', 'Brisbane', 'Remote'];

const HIRING_MANAGERS = ['Olivia Chen', 'Marcus Lee', 'Priya Shah', 'Daniel Morgan', 'Sarah Wilson'];

const SKILLS_FILTER = ['Figma', 'TypeScript', 'HubSpot', 'FP&A', 'Accessibility', 'AWS'];

function loadFromStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn('Could not load from localStorage:', key, e);
  }
  return fallback;
}

function saveToStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('Could not save to localStorage:', key, e);
  }
}

window.TalentHubData = {
  STORAGE_KEYS,
  DEFAULT_REQUISITIONS,
  DEFAULT_CANDIDATES,
  PIPELINE_STAGES,
  PIPELINE_COUNTS,
  KANBAN_STAGES,
  REQUISITION_STATUSES,
  CANDIDATE_STAGES,
  LOCATIONS,
  HIRING_MANAGERS,
  SKILLS_FILTER,
  loadFromStorage,
  saveToStorage
};
