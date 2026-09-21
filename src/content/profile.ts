export type Project = {
  name: string;
  eyebrow: string;
  summary: string;
  highlights: string[];
  stack: string[];
  href?: string;
  linkLabel?: string;
};

export const profile = {
  name: "Kuldeep Singh",
  firstName: "Kuldeep",
  title: "Full Stack Developer",
  availability: "Open to AI developer opportunities",
  location: "India",
  email: "switch2ks@gmail.com",
  social: [
    { label: "GitHub", href: "https://github.com/switch0xd" },
    { label: "LinkedIn", href: "https://www.linkedin.com/in/switchxd" },
  ],
  intro:
    "I build dependable web systems across healthcare, HR, and developer tooling—with a focus on practical backend architecture, usable interfaces, and honest AI experiences.",
  about: [
    "I am a full stack developer with more than two years of documented experience delivering applications across healthcare and HR domains. My work spans Node.js, Express.js, React, Next.js, TypeScript, MongoDB, REST APIs, and cloud deployment.",
    "This portfolio is deliberately paired with a retrieval assistant: it answers only from the supplied resume and project notes, and says so when the evidence is not there.",
  ],
  projects: [
    {
      name: "HIMS",
      eyebrow: "Healthcare Information Management System · 2024–2025",
      summary:
        "A multi-tenant healthcare platform delivered end to end, with secure tenant isolation and standards-based data exchange.",
      highlights: [
        "Built Node.js, Express.js, and TypeScript services with HL7 FHIR R4 REST APIs.",
        "Implemented Firebase Authentication, OAuth2, RBAC controls, secure sessions, and tenant-specific configuration.",
        "Deployed on GCP App Engine with a reported 25% infrastructure-cost reduction while maintaining high availability.",
      ],
      stack: ["Next.js", "React", "Node.js", "Express", "TypeScript", "MongoDB", "FHIR R4", "GCP"],
    },
    {
      name: "TrustDrive",
      eyebrow: "Hackathon project · Educational document integrity",
      summary:
        "A blockchain-based cloud-storage prototype that combines IPFS document storage with smart-contract-backed records.",
      highlights: [
        "Kept document content in Pinata IPFS while recording associated integrity information on-chain.",
        "Connected a React client to Solidity contracts with Ether.js and a Hardhat local development workflow.",
        "Designed the prototype to make unauthorised document alteration or deletion detectable.",
      ],
      stack: ["React", "Solidity", "Ether.js", "Pinata IPFS", "Hardhat"],
      href: "https://github.com/Switch0XD/trustDrive",
      linkLabel: "View repository",
    },
  ] satisfies Project[],
};
