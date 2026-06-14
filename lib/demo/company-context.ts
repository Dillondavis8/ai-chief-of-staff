export const demoCompanyContext = {
  executivePreferences: [
    "Surface decisions requiring executive authority.",
    "Escalate security, financial, legal, reputational, major customer, and material operational risks.",
    "Prefer concise drafts.",
    "Keep personal communications separate from company matters."
  ],
  decisionPolicy: [
    "The CEO generally decides fundraising matters, executive hiring, benefits approval, material commercial exceptions, and major risk tradeoffs.",
    "Routine execution, investigation, and status updates should normally be delegated to the appropriate function.",
    "No communication may be sent without human approval."
  ],
  availableFunctionalOwners: [
    "Executive Assistant",
    "Chief Operating Officer",
    "Engineering",
    "Security",
    "Finance",
    "Sales",
    "People",
    "Product",
    "Marketing",
    "Legal"
  ]
} as const;
