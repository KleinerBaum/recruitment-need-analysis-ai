export type DemoJobAdLanguage = "de" | "en";

export interface DemoJobAd {
  readonly id: string;
  readonly title: string;
  readonly language: DemoJobAdLanguage;
  readonly location: string;
  readonly text: string;
}

export const DEMO_JOB_ADS = [
  {
    id: "TESTJOBAD-DE-01",
    title: "People Analytics Specialist / HR Data Analyst (m/w/d)",
    language: "de",
    location: "Berlin, Deutschland",
    text: `People Analytics Specialist / HR Data Analyst (m/w/d)

Unternehmen:
Talentwerk Solutions GmbH

Branche:
HR-Tech / People Analytics / Organisationsentwicklung

Standort:
Berlin, Deutschland

Arbeitsmodell:
Hybrid: 2 Tage pro Woche im Büro, mobiles Arbeiten an den übrigen Tagen möglich. Kein Remote-only-Modell.

Beschäftigungsart:
Festanstellung, Vollzeit oder 80%-Teilzeit möglich

Seniorität:
Professional / Mid-Level

Gehalt:
60.000–75.000 EUR brutto/Jahr, abhängig von Erfahrung und Qualifikation

Sprachen:
Deutsch: sehr gut
Englisch: gut bis sehr gut

Kontakt:
recruiting@talentwerk.example

Über die Rolle:
Du unterstützt unser People-Team dabei, HR-Daten in belastbare Entscheidungsgrundlagen zu übersetzen. Dabei arbeitest du an Themen wie Workforce Planning, Fluktuationsanalysen, Recruiting-Funnel-Auswertung, Engagement-Daten und HR-Reporting. Die Rolle verbindet analytisches Arbeiten mit verständlicher Kommunikation für HR, Führungskräfte und Geschäftsleitung.

Deine Aufgaben:
- Aufbau und Weiterentwicklung von People-Analytics-Dashboards
- Analyse von Recruiting-, Retention-, Performance- und Engagement-Daten
- Ableitung von Handlungsempfehlungen für HR und Führungskräfte
- Qualitätssicherung von HR-Daten aus verschiedenen Systemen
- Entwicklung von Kennzahlen, Reporting-Standards und Datenmodellen
- Zusammenarbeit mit HR Business Partnern, Controlling und IT

Must-have-Anforderungen:
- Abgeschlossenes Studium in Wirtschaft, Psychologie, Statistik, Data Analytics, Wirtschaftsinformatik oder vergleichbare Qualifikation
- Erfahrung mit HR-Reporting, People Analytics oder Business Intelligence
- Sicherer Umgang mit Excel oder Google Sheets sowie einem BI-Tool, z. B. Power BI, Tableau oder Looker
- Grundverständnis von Datenmodellen, Datenqualität und KPI-Definitionen
- Fähigkeit, komplexe Analysen verständlich für nicht-technische Zielgruppen aufzubereiten
- Sehr gute Deutschkenntnisse und gute bis sehr gute Englischkenntnisse

Nice-to-have-Anforderungen:
- Erfahrung mit Workday, Personio, SAP SuccessFactors oder ähnlichen HR-Systemen
- Kenntnisse in SQL, Python oder R
- Erfahrung mit Datenschutzanforderungen im HR-Kontext
- Erfahrung mit statistischen Methoden, z. B. Regressionsanalysen oder Kohortenanalysen

Benefits:
- Hybrides Arbeiten mit klarer Büroregelung
- Weiterbildungsbudget von 1.500 EUR pro Jahr
- Betriebliche Altersvorsorge
- Zuschuss zum Deutschlandticket
- 30 Urlaubstage
- Interne Communities zu Data, HR und Organisationsentwicklung`,
  },
  {
    id: "TESTJOBAD-DE-02",
    title: "Senior Backend Engineer Java/Kotlin (all genders)",
    language: "de",
    location: "Hamburg oder Köln, Deutschland",
    text: `Senior Backend Engineer Java/Kotlin (all genders)

Unternehmen:
Nordcloud Retail Systems AG

Branche:
E-Commerce / Retail Technology / Cloud Software

Standort:
Hamburg oder Köln, Deutschland

Arbeitsmodell:
Remote innerhalb Deutschlands möglich; quartalsweise Teamtage in Hamburg oder Köln werden erwartet.

Beschäftigungsart:
Festanstellung, Vollzeit

Seniorität:
Senior Individual Contributor

Gehalt:
Wettbewerbsfähiges Gehalt; keine konkrete Gehaltsspanne angegeben

Sprachen:
Deutsch: nicht zwingend erforderlich
Englisch: fließend

Kontakt:
jobs@nordcloud-retail.example

Über die Rolle:
Wir entwickeln skalierbare Plattformdienste für digitale Handelsprozesse, darunter Warenkorb-, Checkout-, Promotion- und Order-Management-Services. Als Senior Backend Engineer arbeitest du in einem produktorientierten Engineering-Team und gestaltest robuste APIs, eventgetriebene Services und Cloud-native Architekturen.

Deine Aufgaben:
- Entwicklung und Betrieb von Backend-Services mit Java, Kotlin oder vergleichbaren JVM-Technologien
- Design von REST- und eventgetriebenen Schnittstellen
- Mitwirkung an Architekturentscheidungen für skalierbare Cloud-Systeme
- Verbesserung von Observability, Performance und Resilienz
- Zusammenarbeit mit Product Management, QA und Platform Engineering
- Technisches Mentoring für weniger erfahrene Entwickler:innen ohne disziplinarische Führungsverantwortung

Must-have-Anforderungen:
- Mehrjährige Backend-Erfahrung mit Java, Kotlin oder vergleichbaren JVM-Technologien
- Erfahrung mit Spring Boot oder ähnlichen Frameworks
- Praxis mit Cloud-Plattformen, z. B. AWS, Azure oder Google Cloud
- Erfahrung mit relationalen oder dokumentenorientierten Datenbanken
- Verständnis für CI/CD, automatisierte Tests und produktionsnahen Betrieb
- Fließende Englischkenntnisse

Nice-to-have-Anforderungen:
- Erfahrung mit Kafka, RabbitMQ oder anderen Messaging-Systemen
- Kenntnisse in Kubernetes oder Infrastructure as Code
- Erfahrung im E-Commerce-, Payment- oder Order-Management-Umfeld
- Deutschkenntnisse
- Erfahrung mit Domain-driven Design

Benefits:
- Remote-Arbeit innerhalb Deutschlands
- Budget für Konferenzen und Zertifizierungen
- Moderne Hardware nach Wahl
- 30 Urlaubstage
- Beteiligung an Open-Source-Projekten möglich
- Mentoring- und Engineering-Guilds`,
  },
  {
    id: "TESTJOBAD-DE-03",
    title: "Leitung Pflegekoordination Digital Health (m/w/d)",
    language: "de",
    location: "Leipzig, Deutschland",
    text: `Leitung Pflegekoordination Digital Health (m/w/d)

Unternehmen:
Medicare Connect Klinikverbund gGmbH

Branche:
Gesundheitswesen / Klinikverbund / Digitale Versorgung

Standort:
Leipzig, Deutschland

Arbeitsmodell:
Überwiegend vor Ort; einzelne administrative Tätigkeiten können mobil erledigt werden.

Beschäftigungsart:
Festanstellung, Vollzeit

Seniorität:
Leitung / Teamlead

Gehalt:
Vergütung angelehnt an interne Vergütungsstruktur; konkrete Eingruppierung abhängig von Qualifikation und Verantwortung. Keine numerische Spanne genannt.

Sprachen:
Deutsch: fließend
Englisch: nicht erforderlich

Kontakt:
karriere@medicare-connect.example

Über die Rolle:
In dieser Rolle leitest du ein interdisziplinäres Team, das pflegerische Abläufe, digitale Dokumentation und Versorgungskoordination in mehreren Fachbereichen verbessert. Du arbeitest eng mit Pflegedienstleitung, Ärzt:innen, IT, Qualitätsmanagement und externen Partnern zusammen.

Deine Aufgaben:
- Fachliche und disziplinarische Führung eines Teams von Pflegekoordinator:innen
- Weiterentwicklung digital unterstützter Pflegeprozesse
- Sicherstellung der Dokumentationsqualität in klinischen Systemen
- Koordination zwischen Stationen, Ambulanzen, IT und Qualitätsmanagement
- Schulung von Mitarbeitenden zu digitalen Dokumentationsprozessen
- Begleitung von Veränderungsprojekten im klinischen Alltag
- Unterstützung bei Audits und internen Qualitätsprüfungen

Must-have-Anforderungen:
- Abgeschlossene Ausbildung oder Studium im Pflege-, Gesundheits- oder Sozialwesen
- Mehrjährige Berufserfahrung in Pflegekoordination, Stationsorganisation oder klinischem Prozessmanagement
- Erfahrung mit digitaler Pflegedokumentation oder Krankenhausinformationssystemen
- Erfahrung in fachlicher und disziplinarischer Führung
- Sehr gute Deutschkenntnisse
- Strukturierte, verbindliche und patient:innenorientierte Arbeitsweise

Nice-to-have-Anforderungen:
- Weiterbildung im Pflege- oder Qualitätsmanagement
- Erfahrung mit Change Management im Gesundheitswesen
- Kenntnisse in Krankenhausinformationssystemen wie ORBIS, iMedOne oder vergleichbaren Lösungen
- Erfahrung in standortübergreifender Zusammenarbeit

Benefits:
- Sinnstiftende Tätigkeit in einem gemeinnützigen Klinikverbund
- Fort- und Weiterbildungsangebote
- Betriebliche Altersvorsorge
- Gesundheitsangebote
- Zuschuss zum Nahverkehr
- Planbare Arbeitszeiten ohne regelmäßige Nachtschichten`,
  },
  {
    id: "TESTJOBAD-EN-01",
    title: "Product Marketing Manager, Cybersecurity SaaS (all genders)",
    language: "en",
    location: "London, United Kingdom",
    text: `Product Marketing Manager, Cybersecurity SaaS (all genders)

Company:
ShieldStack Software Ltd.

Industry:
Cybersecurity / B2B SaaS / Cloud Security

Location:
London, United Kingdom

Work model:
Hybrid: usually 2–3 days per week in the London office. Occasional remote weeks may be agreed with the manager.

Employment type:
Permanent, full-time

Seniority:
Senior Professional

Salary:
GBP 65,000–80,000 gross per year plus performance-related bonus

Languages:
English: fluent
German: not required

Contact:
careers@shieldstack.example

Role summary:
You will own product positioning, messaging and go-to-market enablement for a cloud security platform used by mid-market and enterprise customers. The role sits between Product, Sales, Customer Success and Demand Generation and requires the ability to translate technical capabilities into clear commercial narratives.

Responsibilities:
- Develop positioning, messaging and value propositions for cybersecurity products
- Create sales enablement materials, battlecards, launch briefs and customer-facing content
- Plan and execute go-to-market activities for new features and product releases
- Conduct competitor and market analysis
- Partner with Product Management to refine customer personas and use cases
- Support webinars, events and analyst briefings
- Measure launch effectiveness and content performance

Must-have requirements:
- Experience in product marketing for B2B SaaS, cybersecurity, cloud infrastructure or enterprise software
- Strong ability to translate technical product details into customer value
- Experience creating sales enablement assets and go-to-market materials
- Excellent written and spoken English
- Stakeholder management experience across Product, Sales and Marketing
- Analytical mindset and ability to use data to improve messaging and campaigns

Nice-to-have requirements:
- Experience with cloud security, identity security, DevSecOps or compliance use cases
- Familiarity with frameworks such as SOC 2, ISO 27001 or NIST
- Experience with analyst relations or industry reports
- Experience working with distributed teams across Europe and North America

Benefits:
- Hybrid working model
- Annual learning budget
- Private health insurance
- Pension contribution
- 28 days annual leave plus public holidays
- Budget for conferences and industry events`,
  },
  {
    id: "TESTJOBAD-EN-02",
    title: "Data Engineer, Climate Analytics Platform (all genders)",
    language: "en",
    location: "Amsterdam, Netherlands",
    text: `Data Engineer, Climate Analytics Platform (all genders)

Company:
GreenGrid Analytics B.V.

Industry:
Climate Tech / Energy Analytics / Data Platforms

Location:
Amsterdam, Netherlands

Work model:
Flexible hybrid model. Team members usually work from the Amsterdam office once or twice per week. Cross-border remote work is not guaranteed.

Employment type:
Permanent, full-time or 32 hours per week

Seniority:
Professional / Senior Professional

Salary:
EUR 70,000–90,000 gross per year, depending on experience

Languages:
English: fluent
Dutch: nice to have

Contact:
hiring@greengrid.example

Role summary:
GreenGrid Analytics builds data products that help energy providers, grid operators and infrastructure investors understand climate risk, energy demand and asset performance. As a Data Engineer, you will build reliable pipelines, data models and platform components for analytics and machine learning use cases.

Responsibilities:
- Build and maintain data pipelines for structured and semi-structured datasets
- Design data models for analytics, reporting and machine learning workflows
- Improve data quality, lineage and observability
- Collaborate with data scientists, platform engineers and domain experts
- Work with cloud-native tooling and infrastructure-as-code practices
- Support production incidents related to data availability or pipeline reliability

Must-have requirements:
- Experience building production-grade data pipelines
- Strong SQL skills
- Experience with Python
- Experience with cloud data platforms such as BigQuery, Snowflake, Databricks, Redshift or similar
- Understanding of data quality, testing and monitoring
- Fluent English skills

Nice-to-have requirements:
- Experience with energy, climate, geospatial or infrastructure datasets
- Experience with dbt, Airflow, Dagster or similar orchestration tools
- Experience with Terraform or infrastructure as code
- Dutch language skills
- Familiarity with machine learning feature pipelines

Benefits:
- Hybrid working model
- 32-hour contract option
- Learning and conference budget
- Public transport allowance
- Pension contribution
- Mission-driven work in climate and energy analytics`,
  },
  {
    id: "TESTJOBAD-EN-03",
    title: "HR Business Partner, Manufacturing Operations (all genders)",
    language: "en",
    location: "Manchester, United Kingdom",
    text: `HR Business Partner, Manufacturing Operations (all genders)

Company:
Northbridge Components plc

Industry:
Manufacturing / Industrial Components / Operations

Location:
Manchester, United Kingdom

Work model:
Primarily on-site due to production environment. One remote administration day per week may be possible after onboarding.

Employment type:
Permanent, full-time

Seniority:
Experienced Professional / HR Business Partner

Salary:
Competitive salary and benefits package. No numeric salary range provided.

Languages:
English: fluent
Polish: nice to have
German: not required

Contact:
peoplecareers@northbridge.example

Role summary:
You will partner with plant leadership, shift managers and central HR teams to support a manufacturing site of approximately 450 employees. The role covers employee relations, workforce planning, manager coaching, absence management and implementation of HR processes in a production environment.

Responsibilities:
- Act as HR partner for operations leaders and shift managers
- Advise on employee relations cases, absence management and performance topics
- Support workforce planning and recruitment coordination for production roles
- Coach managers on fair, consistent and inclusive people practices
- Contribute to engagement, retention and learning initiatives
- Work with payroll, talent acquisition and central HR teams
- Maintain accurate HR documentation and reporting

Must-have requirements:
- HR generalist or HR business partner experience in manufacturing, logistics, retail operations or another operational environment
- Knowledge of employee relations processes in the UK
- Experience advising managers on people topics
- Strong communication and stakeholder management skills
- Fluent English skills
- Willingness to work primarily on-site

Nice-to-have requirements:
- CIPD qualification or working towards CIPD
- Experience in a unionised environment
- Polish language skills
- Experience with HR systems such as Workday, SAP SuccessFactors, HiBob or similar
- Experience supporting shift-based workforces

Benefits:
- Competitive salary and benefits package
- Pension contribution
- Employee assistance programme
- Learning and development support
- On-site parking
- Health and wellbeing initiatives`,
  },
] as const satisfies readonly DemoJobAd[];
