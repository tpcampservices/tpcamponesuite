import type { PolicySection } from "@/components/policy-page";

export const POLICY_EFFECTIVE_DATE = "27 August 2026";
export const POLICY_LAST_UPDATED = "27 August 2026";

export const termsSections: PolicySection[] = [
  {
    number: 1,
    heading: "Introduction and Acceptance",
    blocks: [
      {
        type: "p",
        text: "These Terms of Service (“Terms”) govern your access to and use of TP-CAMP One Suite, including the main TP-CAMP One Suite platform and any applications, modules, websites, tools, portals, features and related services made available through or in connection with your TP-CAMP account, subscription or service plan (collectively, the “Services”).",
      },
      {
        type: "p",
        text: "TP-CAMP One Suite is operated as part of the TP-CAMP music-business services ecosystem (“TP-CAMP”, “we”, “us” or “our”).",
      },
      {
        type: "p",
        text: "By creating an account, purchasing a plan, accessing a TP-CAMP application or otherwise using the Services, you agree to these Terms. If you do not agree with these Terms, you should not use the Services.",
      },
    ],
  },
  {
    number: 2,
    heading: "TP-CAMP One Suite Ecosystem",
    blocks: [
      {
        type: "p",
        text: "TP-CAMP One Suite is designed as a centralized music-business workspace for artists, managers, labels, publishers, producers, music companies and other authorized users.",
      },
      {
        type: "p",
        text: "Depending on the user's plan and the features currently available, the Services may include tools for:",
      },
      {
        type: "ul",
        items: [
          "music catalogue and repertoire management;",
          "composition and sound-recording metadata;",
          "songwriter, publisher, performer, producer, label and contributor information;",
          "split sheets and ownership records;",
          "invoicing, quotations, receipts and customer management;",
          "supplier bills, payment vouchers and payables;",
          "financial bookkeeping and business reporting;",
          "royalty and revenue administration;",
          "release and campaign budgeting;",
          "workflow, project and task management;",
          "contract and document generation;",
          "release and rights-administration workflows;",
          "business and operational reporting; and",
          "other music-business tools introduced by TP-CAMP.",
        ],
      },
      {
        type: "p",
        text: "Individual applications may operate from separate web addresses or technical environments. Unless expressly stated otherwise, those applications form part of the TP-CAMP One Suite Services and are governed by these Terms.",
      },
    ],
  },
  {
    number: 3,
    heading: "Eligibility and Business Use",
    blocks: [
      {
        type: "p",
        text: "You must be legally capable of entering into a binding agreement to create and operate a TP-CAMP business account.",
      },
      {
        type: "p",
        text: "The Services are primarily intended for professional and business activities within the music and creative industries.",
      },
      {
        type: "p",
        text: "If you use TP-CAMP on behalf of a company, label, publisher, management company, artist, organization or other entity, you represent that you have authority to act on behalf of that entity.",
      },
    ],
  },
  {
    number: 4,
    heading: "Accounts and Security",
    blocks: [
      { type: "p", text: "You agree to provide accurate, current and complete account information." },
      { type: "p", text: "You are responsible for:" },
      {
        type: "ul",
        items: [
          "maintaining the confidentiality of your login credentials;",
          "activity performed through your account by authorized users;",
          "maintaining appropriate access permissions for members of your team;",
          "promptly notifying TP-CAMP of suspected unauthorized access; and",
          "ensuring that information submitted through your account is lawful and accurate.",
        ],
      },
      {
        type: "p",
        text: "You must not share credentials in a manner that circumvents applicable account, user or subscription restrictions. TP-CAMP may implement authentication, security verification, session management and other safeguards to protect accounts and the Services.",
      },
    ],
  },
  {
    number: 5,
    heading: "Plans, Payments and Access",
    blocks: [
      {
        type: "p",
        text: "TP-CAMP may offer different plans, tiers, subscriptions, one-time access arrangements or service packages.",
      },
      {
        type: "p",
        text: "The price, currency, billing period, whether the purchase is recurring or one-time, included functionality and applicable renewal terms displayed to you at checkout or in your order documentation will govern your purchase.",
      },
      {
        type: "p",
        text: "Where recurring billing applies, you authorize the applicable payment provider to process payments according to the billing arrangement presented at checkout until the subscription is cancelled or otherwise terminated.",
      },
      {
        type: "p",
        text: "Users are responsible for applicable taxes, duties or similar governmental charges unless stated otherwise.",
      },
      {
        type: "p",
        text: "TP-CAMP may use third-party payment processors. Payment processing may therefore also be subject to the terms and privacy practices of the applicable payment provider.",
      },
      {
        type: "p",
        text: "Access to particular modules may depend upon your plan, account status and successful payment.",
      },
      {
        type: "p",
        text: "Failure or reversal of payment may result in restricted, suspended or terminated access.",
      },
    ],
  },
  {
    number: 6,
    heading: "Cancellation and Refunds",
    blocks: [
      {
        type: "p",
        text: "Where your plan renews automatically, you may cancel future renewal using the account or support method made available by TP-CAMP. Cancellation ordinarily prevents the next renewal rather than retroactively cancelling an already-paid period. Refund eligibility is governed by the TP-CAMP Refund Policy, which forms part of these Terms. Nothing in these Terms limits rights that cannot lawfully be waived under applicable consumer law.",
      },
    ],
  },
  {
    number: 7,
    heading: "Beta and Developing Software",
    blocks: [
      {
        type: "p",
        text: "Certain TP-CAMP applications and features may be identified as beta, preview, early access, experimental or under active development. You acknowledge that such functionality may:",
      },
      {
        type: "ul",
        items: [
          "contain bugs or errors;",
          "be incomplete;",
          "change during development;",
          "experience interruptions;",
          "produce unexpected results; or",
          "be modified, replaced or discontinued.",
        ],
      },
      {
        type: "p",
        text: "TP-CAMP may improve, redesign, add, remove or replace features as the platform develops. Users should maintain independent copies of information that is critical to their business.",
      },
    ],
  },
  {
    number: 8,
    heading: "User Content and Business Data",
    blocks: [
      {
        type: "p",
        text: "You retain ownership of content and business information that you lawfully upload, create or enter into TP-CAMP (“User Content”). This may include catalogue metadata, financial information, contracts, documents, recordings information, rights information, invoices, customer information, contributor information and project records.",
      },
      {
        type: "p",
        text: "You grant TP-CAMP a limited, non-exclusive right to host, store, copy, process, transmit, back up, display and otherwise handle User Content to the extent reasonably necessary to operate the Services, provide requested functionality, maintain and secure accounts, provide support, perform backups, enable authorized integrations, and comply with applicable law.",
      },
      { type: "p", text: "This permission does not transfer ownership of your User Content to TP-CAMP." },
    ],
  },
  {
    number: 9,
    heading: "Music Rights and Catalogue Information",
    blocks: [
      {
        type: "p",
        text: "TP-CAMP provides tools for organizing and administering music-business information. TP-CAMP does not establish or legally determine ownership of a musical work, sound recording or other right merely because information has been entered into the platform.",
      },
      {
        type: "p",
        text: "Users are responsible for ensuring that information they submit is accurate and that they have authority to submit and use it.",
      },
      {
        type: "p",
        text: "This includes information concerning songwriters and composers, publishers, performers, producers, labels, managers and representatives, copyright ownership, master ownership, publishing ownership, contributor shares, royalty percentages, ISRCs, ISWCs, IPI/CAE numbers, ISNIs, UPC/EAN identifiers, CMO/PRO affiliations, recording and release metadata, and other rights-related information.",
      },
      {
        type: "p",
        text: "A split sheet, catalogue entry, report or other record created through TP-CAMP should not be treated as independent verification by TP-CAMP that the underlying ownership claim is legally valid.",
      },
      {
        type: "p",
        text: "Users should resolve disputed ownership or rights claims through the appropriate contractual, professional, CMO, legal or dispute-resolution channels.",
      },
    ],
  },
  {
    number: 10,
    heading: "Generated Documents and Professional Advice",
    blocks: [
      {
        type: "p",
        text: "TP-CAMP may provide templates, calculations, reports, contracts, financial tools, accounting tools, workflow recommendations or other business-support functionality.",
      },
      {
        type: "p",
        text: "These are operational tools and do not constitute legal, accounting, tax, investment or other regulated professional advice.",
      },
      {
        type: "p",
        text: "Users remain responsible for reviewing documents and financial information before relying upon them. Where appropriate, users should consult a qualified attorney, accountant, tax adviser or other relevant professional.",
      },
    ],
  },
  {
    number: 11,
    heading: "Acceptable Use",
    blocks: [
      { type: "p", text: "You must not use TP-CAMP to:" },
      {
        type: "ul",
        items: [
          "violate applicable law;",
          "infringe copyright, privacy or other rights;",
          "submit knowingly fraudulent copyright or ownership claims;",
          "impersonate another person or organization;",
          "upload malicious software;",
          "attempt unauthorized access to accounts or systems;",
          "bypass security or subscription controls;",
          "scrape or systematically extract platform information without authorization;",
          "disrupt or overload the Services;",
          "use another person's personal information unlawfully;",
          "manipulate financial or rights information for fraudulent purposes; or",
          "assist another person in prohibited conduct.",
        ],
      },
      {
        type: "p",
        text: "TP-CAMP may investigate suspected misuse and restrict access where reasonably necessary to protect users, rights holders, TP-CAMP or third parties.",
      },
    ],
  },
  {
    number: 12,
    heading: "TP-CAMP Intellectual Property",
    blocks: [
      {
        type: "p",
        text: "Except for User Content and third-party materials, the Services and their associated software, designs, interfaces, branding, workflows, documentation, databases and original materials are owned by or licensed to TP-CAMP and are protected by applicable intellectual-property laws. Your subscription gives you permission to use the Services. It does not transfer ownership of the TP-CAMP platform or underlying technology.",
      },
    ],
  },
  {
    number: 13,
    heading: "Third-Party Services",
    blocks: [
      {
        type: "p",
        text: "TP-CAMP may connect with or rely upon third-party providers for services such as hosting, databases, authentication, payments, communications, analytics or external music/business platforms. Third-party services are governed by their respective terms and policies. TP-CAMP is not responsible for failures or changes to third-party services outside TP-CAMP's reasonable control.",
      },
    ],
  },
  {
    number: 14,
    heading: "Data Availability and Backups",
    blocks: [
      {
        type: "p",
        text: "TP-CAMP may implement reasonable backup, recovery and security procedures. However, TP-CAMP One Suite should not be the user's sole repository for irreplaceable business, legal, accounting or rights documentation. Users should maintain appropriate independent records or exports of critical information.",
      },
    ],
  },
  {
    number: 15,
    heading: "Service Availability",
    blocks: [
      {
        type: "p",
        text: "TP-CAMP aims to maintain reliable access but does not guarantee uninterrupted or error-free availability. Access may be affected by maintenance, updates, security incidents, infrastructure failures, internet connectivity, third-party providers, circumstances outside TP-CAMP's reasonable control, or improvements to the platform.",
      },
    ],
  },
  {
    number: 16,
    heading: "Suspension and Termination",
    blocks: [
      {
        type: "p",
        text: "TP-CAMP may reasonably restrict or suspend access where necessary because of non-payment, suspected fraud, prohibited activity, serious security risk, infringement, misuse of the Services, legal or regulatory requirements, or material breach of these Terms. Where reasonably possible, TP-CAMP will seek to provide notice or an opportunity to remedy a correctable issue. Users may stop using the Services and may cancel applicable subscriptions according to their plan terms.",
      },
    ],
  },
  {
    number: 17,
    heading: "Disclaimer of Warranties",
    blocks: [
      {
        type: "p",
        text: "To the maximum extent permitted by applicable law, the Services are provided on an “as available” basis. TP-CAMP does not guarantee that every feature will always be uninterrupted, error-free or suitable for every particular business purpose. Nothing in these Terms excludes warranties, guarantees or protections that cannot legally be excluded.",
      },
    ],
  },
  {
    number: 18,
    heading: "Limitation of Liability",
    blocks: [
      {
        type: "p",
        text: "To the extent permitted by law, TP-CAMP will not be liable for indirect, incidental, consequential or special losses arising from use of the Services, including loss caused by inaccurate information entered by users, unauthorized rights claims, third-party failures or failure to maintain appropriate independent business records. Any limitation applies only to the extent permitted by applicable law. Nothing in these Terms excludes or limits liability where doing so would be unlawful.",
      },
    ],
  },
  {
    number: 19,
    heading: "Indemnification",
    blocks: [
      {
        type: "p",
        text: "To the extent permitted by applicable law, you agree to be responsible for claims, losses or reasonable costs arising from your unlawful use of the Services, infringement of third-party rights, fraudulent or unauthorized rights claims, or material breach of these Terms.",
      },
    ],
  },
  {
    number: 20,
    heading: "Governing Law",
    blocks: [
      {
        type: "p",
        text: "These Terms are governed by the laws of Trinidad and Tobago, without prejudice to mandatory legal protections that may apply to a user in another jurisdiction. Nothing in these Terms removes consumer or statutory rights that cannot lawfully be waived.",
      },
    ],
  },
  {
    number: 21,
    heading: "Changes to These Terms",
    blocks: [
      {
        type: "p",
        text: "TP-CAMP may update these Terms to reflect changes to the Services, business operations, legal requirements or security practices. Where a change is material, TP-CAMP may provide reasonable notice through the website, platform, account interface, email or another appropriate communication method. The current version will display its effective or updated date.",
      },
    ],
  },
  {
    number: 22,
    heading: "Contact",
    blocks: [
      {
        type: "p",
        text: "Questions concerning these Terms may be submitted through the official contact or support method provided on the TP-CAMP One Suite website. When published, the official Terms of Service will be available through the TP-CAMP One Suite website.",
      },
    ],
  },
];

export const privacySections: PolicySection[] = [
  {
    number: 1,
    heading: "Introduction",
    blocks: [
      {
        type: "p",
        text: "This Privacy Policy explains how TP-CAMP collects, uses, stores, shares and protects personal information in connection with TP-CAMP One Suite and its associated applications, modules, websites, tools and services. It applies across the TP-CAMP One Suite ecosystem rather than requiring a separate privacy policy for each connected application.",
      },
    ],
  },
  {
    number: 2,
    heading: "Information We May Collect",
    blocks: [
      {
        type: "p",
        text: "Depending on how you use TP-CAMP One Suite, we may collect or process the following categories of information.",
      },
    ],
  },
  {
    number: 3,
    heading: "Account and Profile Information",
    blocks: [
      {
        type: "p",
        text: "We may process information such as name, email address, telephone number, business or professional information, artist or stage name, company, label, publisher or management information, account credentials and identifiers, organization/team information, and account preferences.",
      },
    ],
  },
  {
    number: 4,
    heading: "Music Catalogue and Rights Information",
    blocks: [
      {
        type: "p",
        text: "Depending on the modules you use, information may include songwriter/composer information, publisher information, performer information, producer information, label information, manager or representative information, contributor contact information, ownership and split percentages, CMO/PRO affiliation, IPI/CAE, ISNI, ISWC, ISRC, UPC/EAN, release information, recording information, and other repertoire or rights metadata.",
      },
    ],
  },
  {
    number: 5,
    heading: "Business and Financial Information",
    blocks: [
      {
        type: "p",
        text: "Information users enter may include customers, suppliers, invoices, quotations, receipts, payment vouchers, transactions, expenses, revenue, budgets, royalty information, bookkeeping records, and other business financial information.",
      },
    ],
  },
  {
    number: 6,
    heading: "Projects, Campaigns and Documents",
    blocks: [
      {
        type: "p",
        text: "We may process project information, campaigns, tasks, deadlines, team assignments, contracts, uploaded files, generated documents, notes, and operational records.",
      },
    ],
  },
  {
    number: 7,
    heading: "Communications",
    blocks: [
      {
        type: "p",
        text: "We may process information contained in support requests, feedback forms, enquiries, account communications, and other correspondence with TP-CAMP.",
      },
    ],
  },
  {
    number: 8,
    heading: "Information Collected Automatically",
    blocks: [
      {
        type: "p",
        text: "Depending on the technologies implemented within the Services, TP-CAMP and its service providers may automatically collect certain technical information, including IP address, browser type, device information, operating system, login timestamps, session information, security events, application errors, pages or features accessed, and basic usage or analytics information. This information may be used for security, authentication, troubleshooting, performance monitoring and service improvement.",
      },
    ],
  },
  {
    number: 9,
    heading: "Payment Information",
    blocks: [
      { type: "p", text: "TP-CAMP may use third-party payment processors to handle payments." },
      {
        type: "p",
        text: "Where payment information is submitted directly to a payment provider, that provider processes the payment credentials according to its own terms and privacy practices. TP-CAMP may receive transaction information such as payment status, amount, currency, transaction identifier, billing status or other information necessary to administer the customer's purchase. Unless TP-CAMP specifically implements infrastructure that stores such information, TP-CAMP does not represent that it stores customers' complete payment-card credentials.",
      },
    ],
  },
  {
    number: 10,
    heading: "How We Use Information",
    blocks: [
      {
        type: "p",
        text: "We may use information to create and maintain accounts, authenticate users, provide access to purchased modules, operate TP-CAMP One Suite, store and process user-created business records, administer subscriptions and entitlements, process and reconcile payments, provide customer support, communicate service information, secure accounts, detect fraud or abuse, troubleshoot technical problems, improve platform functionality, maintain appropriate business records, respond to legal requests, enforce our Terms, and comply with applicable legal obligations.",
      },
    ],
  },
  {
    number: 11,
    heading: "Information About Other People Entered by Users",
    blocks: [
      {
        type: "p",
        text: "TP-CAMP users may enter personal information concerning other individuals, including artists, songwriters, composers, producers, performers, publishers, employees, contractors, customers, suppliers, managers, rights holders, and other contributors. If you provide another person's personal information to TP-CAMP, you are responsible for ensuring that you have an appropriate lawful basis, authorization or other legitimate authority to provide and process that information. TP-CAMP's provision of a field for storing information does not itself establish that the user has legal authority to submit it.",
      },
    ],
  },
  {
    number: 12,
    heading: "How Information May Be Shared",
    blocks: [
      {
        type: "p",
        text: "TP-CAMP may disclose information where reasonably necessary to service providers for hosting, databases, authentication, payment processing, communications, technical support, analytics and related infrastructure; where users direct or authorize sharing; where required for legal and compliance purposes; or in connection with a merger, acquisition, financing, restructuring or transfer of business assets, subject to appropriate legal safeguards.",
      },
    ],
  },
  {
    number: 13,
    heading: "Sale of Personal Information",
    blocks: [
      {
        type: "p",
        text: "TP-CAMP does not sell users' personal information for third-party advertising purposes as part of the TP-CAMP One Suite business model. If this practice changes materially, this Privacy Policy should be updated accordingly.",
      },
    ],
  },
  {
    number: 14,
    heading: "International Processing",
    blocks: [
      {
        type: "p",
        text: "Some technology and service providers used by TP-CAMP may operate infrastructure outside Trinidad and Tobago. As a result, information may be processed or stored in another jurisdiction.",
      },
      {
        type: "p",
        text: "Where appropriate, TP-CAMP will seek to use reasonable contractual, organizational or technical safeguards for cross-border processing.",
      },
    ],
  },
  {
    number: 15,
    heading: "Data Retention",
    blocks: [
      {
        type: "p",
        text: "Information may be retained for as long as reasonably necessary to provide the Services, maintain an active account, meet contractual obligations, maintain legitimate business records, comply with accounting, tax or legal obligations, prevent fraud, resolve disputes, enforce agreements, and maintain reasonable backups. Different categories of information may therefore have different retention periods.",
      },
    ],
  },
  {
    number: 16,
    heading: "Account Closure and Deletion",
    blocks: [
      {
        type: "p",
        text: "Users may request account closure or deletion using TP-CAMP's available account or support process. Closing an account does not necessarily result in immediate deletion of every record. TP-CAMP may retain information where reasonably required for legal compliance, accounting, fraud prevention, dispute resolution, security, enforcement, legitimate business records, or temporary backup and disaster-recovery systems. Where information is no longer reasonably required, TP-CAMP may delete or anonymize it in accordance with applicable requirements.",
      },
    ],
  },
  {
    number: 17,
    heading: "Security",
    blocks: [
      {
        type: "p",
        text: "TP-CAMP seeks to use reasonable administrative, technical and organizational safeguards appropriate to the nature of the information being processed. These may include authentication, access controls, database protections, logging and other technical safeguards. However, no online service, database or transmission method can guarantee absolute security. Users are also responsible for protecting their passwords and controlling access to their accounts.",
      },
    ],
  },
  {
    number: 18,
    heading: "Cookies, Sessions and Similar Technologies",
    blocks: [
      {
        type: "p",
        text: "TP-CAMP and its technology providers may use cookies, browser storage, session technologies or similar mechanisms where necessary for authentication, maintaining login sessions, security, remembering preferences, application functionality, and analytics where implemented. The technologies actually used may evolve as TP-CAMP develops.",
      },
    ],
  },
  {
    number: 19,
    heading: "Your Privacy Rights",
    blocks: [
      {
        type: "p",
        text: "Depending on applicable law and the circumstances, individuals may have rights concerning their personal information, which may include rights to request access, correction or deletion, object to or restrict certain processing, or make another privacy-related request provided by applicable law. Certain requests may be subject to verification and lawful exceptions. Requests may be submitted through the official TP-CAMP contact or support method available through the website.",
      },
    ],
  },
  {
    number: 20,
    heading: "Children's Privacy",
    blocks: [
      {
        type: "p",
        text: "TP-CAMP One Suite is primarily a professional music-business platform and is not intended for children under 18 to independently establish business accounts without appropriate legal authorization. Where a minor legitimately participates in music-business activities and information concerning that person is entered into TP-CAMP, the responsible account holder must ensure that appropriate parental, guardian, contractual or other lawful authorization exists where required.",
      },
    ],
  },
  {
    number: 21,
    heading: "Third-Party Websites and Services",
    blocks: [
      {
        type: "p",
        text: "TP-CAMP may contain links to or integrations with third-party services. Those services operate under their own privacy policies and practices. TP-CAMP is not responsible for the privacy practices of independent third-party services.",
      },
    ],
  },
  {
    number: 22,
    heading: "Trinidad and Tobago and Applicable Privacy Laws",
    blocks: [
      {
        type: "p",
        text: "TP-CAMP is based within the Trinidad and Tobago business environment and seeks to handle personal information consistently with privacy and data-protection requirements applicable to its operations. Where users or processing activities are subject to additional mandatory privacy requirements in another jurisdiction, those requirements may also apply. Nothing in this Policy is intended to remove privacy rights that cannot lawfully be waived.",
      },
    ],
  },
  {
    number: 23,
    heading: "Changes to This Privacy Policy",
    blocks: [
      {
        type: "p",
        text: "TP-CAMP may update this Privacy Policy as its Services, technologies, providers or legal obligations evolve. Material changes may be communicated through the website, account interface, email or another appropriate method. The latest version will identify its effective or updated date.",
      },
    ],
  },
  {
    number: 24,
    heading: "Contact",
    blocks: [
      {
        type: "p",
        text: "Privacy questions, requests or concerns may be submitted through the official contact or support method provided on the TP-CAMP One Suite website. When published, the official Privacy Policy will be available through the TP-CAMP One Suite website.",
      },
    ],
  },
];

export const refundSections: PolicySection[] = [
  {
    number: 1,
    heading: "Purpose",
    blocks: [
      {
        type: "p",
        text: "This Refund and Cancellation Policy applies to eligible purchases made for TP-CAMP One Suite, including access to associated applications, modules and digital services made available under a TP-CAMP plan.",
      },
      { type: "p", text: "This Policy should be read together with the TP-CAMP Terms of Service." },
    ],
  },
  {
    number: 2,
    heading: "Pricing and Billing Terms",
    blocks: [
      {
        type: "p",
        text: "The applicable price, currency, billing period and whether a purchase is recurring or one-time will be displayed during the applicable purchase or checkout process.",
      },
      { type: "p", text: "Customers should review these details before completing payment." },
      {
        type: "p",
        text: "Where recurring billing applies, the renewal terms presented at checkout govern the recurring purchase.",
      },
    ],
  },
  {
    number: 3,
    heading: "Cancelling Recurring Subscriptions",
    blocks: [
      {
        type: "p",
        text: "Where a TP-CAMP plan renews automatically, users may cancel future renewal through the account or support method made available by TP-CAMP.",
      },
      { type: "p", text: "Cancellation should be completed before the next renewal date." },
      {
        type: "p",
        text: "Unless otherwise stated or required by applicable law, cancellation prevents future renewal but does not automatically create a refund for a billing period that has already been paid.",
      },
      {
        type: "p",
        text: "Users may ordinarily continue accessing eligible Services until the end of their paid access period, subject to the applicable plan terms and account standing.",
      },
    ],
  },
  {
    number: 4,
    heading: "Digital Access Fees",
    blocks: [
      {
        type: "p",
        text: "Annual or other prepaid fees for TP-CAMP digital access are generally non-refundable after access has been activated, except where required by applicable law, where TP-CAMP approves a qualifying exception under this Policy, or where TP-CAMP expressly agreed to different refund terms at the time of purchase.",
      },
      {
        type: "p",
        text: "This policy reflects the fact that customers may receive immediate access to digital tools, applications and platform functionality following activation.",
      },
    ],
  },
  {
    number: 5,
    heading: "Potential Qualifying Refund Circumstances",
    blocks: [
      {
        type: "p",
        text: "TP-CAMP may consider a refund or appropriate billing adjustment in verified cases such as a duplicate charge, an incorrect charge materially different from the amount validly authorized, a verified payment-processing error, or a material technical problem attributable to TP-CAMP that prevents access to the purchased Service and cannot reasonably be resolved after it has been reported.",
      },
      {
        type: "p",
        text: "TP-CAMP may first attempt to restore access or otherwise remedy the problem before determining whether a refund is appropriate.",
      },
    ],
  },
  {
    number: 6,
    heading: "Request Period",
    blocks: [
      {
        type: "p",
        text: "Customers should report disputed charges or qualifying refund issues promptly and preferably within seven (7) days of the applicable charge.",
      },
      {
        type: "p",
        text: "A request should include sufficient information to identify the transaction, such as account holder, transaction date, amount, transaction/payment reference, affected TP-CAMP account, and reason for the request.",
      },
      {
        type: "p",
        text: "The seven-day administrative request period does not eliminate or restrict rights that cannot lawfully be waived under applicable law.",
      },
    ],
  },
  {
    number: 7,
    heading: "Circumstances Normally Not Eligible for Refund",
    blocks: [
      {
        type: "p",
        text: "Subject to applicable law, refunds will generally not be provided because a customer changes their mind after substantial use of the Services; does not use the Services after purchasing access; no longer needs the Services; dislikes a feature that operates substantially as accurately described; experiences a problem caused by their own device, internet connection or unsupported third-party environment; is affected by an independent third-party outage outside TP-CAMP's reasonable control; has access restricted because of prohibited activity or a material breach of the Terms; or failed to cancel a recurring subscription before renewal despite the renewal terms being properly disclosed.",
      },
      { type: "p", text: "This section does not override mandatory legal rights." },
    ],
  },
  {
    number: 8,
    heading: "Beta Features",
    blocks: [
      {
        type: "p",
        text: "Certain TP-CAMP functionality may be identified as beta, preview, early access or under development.",
      },
      {
        type: "p",
        text: "The existence of a minor bug, feature change or temporary interruption in beta functionality does not automatically create refund eligibility.",
      },
      {
        type: "p",
        text: "A material failure that prevents access to the purchased core Service may nevertheless be reviewed under Section 5.",
      },
    ],
  },
  {
    number: 9,
    heading: "Professional, Administrative and Support Services",
    blocks: [
      {
        type: "p",
        text: "TP-CAMP may separately provide professional or operational services in addition to software access. These may include catalogue administration, rights administration, registrations, music-business consulting, campaign support, distribution administration, publishing or label services, project administration, data preparation, onboarding, or other agreed professional work.",
      },
      {
        type: "p",
        text: "Unless otherwise stated in the applicable quotation, invoice, engagement agreement or service agreement, fees for professional work are generally non-refundable after the work has commenced, to the extent permitted by law.",
      },
      {
        type: "p",
        text: "Where work has not commenced, TP-CAMP may review the circumstances and any applicable contractual commitments before determining whether a refund is available.",
      },
    ],
  },
  {
    number: 10,
    heading: "Third-Party and Pass-Through Costs",
    blocks: [
      {
        type: "p",
        text: "Certain TP-CAMP services may require payments to external providers or third parties on a customer's behalf.",
      },
      {
        type: "p",
        text: "Third-party or pass-through costs that TP-CAMP has already paid, committed or incurred on behalf of the customer are generally non-refundable unless TP-CAMP successfully recovers those funds from the relevant provider.",
      },
      {
        type: "p",
        text: "Where an external provider maintains its own refund rules, those rules may also affect whether the cost can be recovered.",
      },
    ],
  },
  {
    number: 11,
    heading: "Approved Refunds",
    blocks: [
      {
        type: "p",
        text: "Where TP-CAMP approves a refund, the refund will ordinarily be returned through the original payment method where reasonably possible. Processing times may depend upon the payment processor, card issuer, financial institution, currency and banking network. TP-CAMP cannot guarantee the exact date on which an approved refund will appear in the customer's account after it has been released to the payment provider.",
      },
    ],
  },
  {
    number: 12,
    heading: "Chargebacks and Payment Disputes",
    blocks: [
      {
        type: "p",
        text: "Customers are encouraged to contact TP-CAMP promptly if they believe a billing error has occurred so that the issue can be investigated. Nothing in this Policy prevents a customer from exercising a legitimate right to dispute an unauthorized or incorrect transaction through their payment provider. However, fraudulent, knowingly false or abusive chargebacks may result in account restriction or suspension and may be investigated by TP-CAMP or the applicable payment provider.",
      },
    ],
  },
  {
    number: 13,
    heading: "Promotional or Special Offers",
    blocks: [
      {
        type: "p",
        text: "Where TP-CAMP provides a promotional, discounted, trial or specially negotiated arrangement, additional terms may apply. Any special refund condition will be disclosed as part of the applicable offer or agreement.",
      },
    ],
  },
  {
    number: 14,
    heading: "Non-Waivable Rights",
    blocks: [
      {
        type: "p",
        text: "Nothing in this Refund and Cancellation Policy excludes, restricts or modifies any refund, cancellation or consumer right that cannot lawfully be excluded under applicable law. Where mandatory law provides greater protection than this Policy, the mandatory legal requirement will apply.",
      },
    ],
  },
  {
    number: 15,
    heading: "Changes to This Policy",
    blocks: [
      {
        type: "p",
        text: "TP-CAMP may update this Policy as its pricing, payment systems, Services or legal requirements evolve. Material changes may be communicated through the website, account interface, email or another appropriate method. The latest version will display its effective or updated date.",
      },
    ],
  },
  {
    number: 16,
    heading: "Contact and Refund Requests",
    blocks: [
      {
        type: "p",
        text: "Refund, cancellation and billing enquiries may be submitted through the official contact or support method provided on the TP-CAMP One Suite website. When published, the official Refund and Cancellation Policy will be available through the TP-CAMP One Suite website.",
      },
    ],
  },
];
