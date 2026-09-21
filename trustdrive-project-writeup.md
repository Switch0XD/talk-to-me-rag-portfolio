# TrustDrive — Blockchain-Based Cloud Storage for Educational Documents

## Project Overview

TrustDrive is a blockchain-based cloud storage application designed for universities, schools, and educational institutions to store digital documents securely and reduce the risk of document forgery. The repository describes the system as using blockchain to create a tamper-resistant record of uploaded documents and smart contracts to protect application data.

The project was developed as a hackathon project. My resume identifies TrustDrive as a blockchain-based cloud storage system built using React.js, Ether.js, Solidity, Pinata IPFS, and Hardhat.

## Problem Statement

Educational institutions manage documents such as certificates, diplomas, transcripts, and other academic records. A key requirement is preserving the integrity and traceability of these records so that unauthorized modification or fraudulent copies can be detected.

TrustDrive addresses this problem by combining decentralized file storage with blockchain-based recording of document information. The repository README states that the design is intended to make document alteration or deletion detectable through the blockchain record.

## Objective

The primary objectives of TrustDrive were:

- Provide a secure mechanism for storing educational documents.
- Use decentralized storage for document data.
- Maintain a blockchain-backed record associated with uploaded documents.
- Reduce opportunities for document forgery by preserving an auditable record.
- Demonstrate integration between a web application, smart contracts, decentralized storage, and a local Ethereum-compatible development network.

## High-Level Architecture

```text
User
  |
  v
React.js Client
  |
  +------ Ether.js ------> Solidity Smart Contract
  |                              |
  |                              v
  |                       Blockchain Record
  |
  +------ Upload --------> Pinata IPFS
                                 |
                                 v
                         Decentralized File Storage
```

The GitHub repository is organized into a `client` application, `contracts`, `scripts`, and a Hardhat configuration, which reflects the separation between the web client, smart-contract layer, and blockchain deployment tooling.

## Technology Stack

### Frontend

- React.js
- JavaScript
- CSS / HTML

### Blockchain

- Solidity
- Ether.js
- Hardhat

### Decentralized Storage

- Pinata IPFS

### Development Environment

- Hardhat local blockchain
- npm

## Core Workflow

### 1. Document Upload

The user interacts with the React.js client to select and submit an educational document.

### 2. Decentralized Storage

The document is uploaded to IPFS through Pinata. IPFS provides content-addressed storage so the uploaded file can be referenced by its resulting content identifier.

### 3. Blockchain Recording

The application interacts with the Solidity smart contract through Ether.js. Relevant document information is recorded through the contract so that the application has a blockchain-backed record associated with the stored document.

### 4. Verification / Integrity

The blockchain record provides a persistent trace for the document. The repository README describes this as a tamper-proof record intended to make unauthorized alteration or deletion detectable.

## Smart Contract Layer

The smart-contract component is contained in the repository's `contracts` directory and is deployed through Hardhat scripts. Ether.js is used from the application layer to communicate with the deployed contract.

This separation keeps blockchain state management inside the smart contract while the React client handles user interaction and application-level workflows.

## Why IPFS + Blockchain

The project separates two concerns:

- **IPFS / Pinata:** stores the actual document content in decentralized storage.
- **Blockchain / Smart Contract:** maintains a persistent record associated with the document.

This architecture avoids treating the blockchain as a traditional file-storage system while using blockchain immutability characteristics for integrity and traceability.

## Development and Local Execution

The repository README describes the following local workflow.

### Blockchain / backend environment

```bash
npm i
npx hardhat node
npx hardhat run scripts/deploy.js
```

### Frontend

```bash
npm i
npm start
```

The Hardhat node provides the local blockchain environment, while the deployment script compiles/deploys the contract before the client interacts with it.

## My Contribution

I worked on the design and implementation of the blockchain-based document storage workflow, including the web client, smart-contract integration, decentralized file storage integration, and local blockchain deployment workflow.

Key implementation areas represented in the project include:

- React.js frontend development.
- Smart-contract development using Solidity.
- Ethereum-compatible contract interaction through Ether.js.
- IPFS-based document storage through Pinata.
- Hardhat-based contract compilation, deployment, and local blockchain execution.
- Integration of the frontend with blockchain and decentralized-storage components.

## Technical Design Decisions

### Decentralized file storage instead of blockchain file storage

The design uses IPFS for document storage rather than storing complete document files directly on-chain. This separates large file storage from blockchain state and allows the blockchain layer to focus on persistent integrity-related records.

### Smart contract for application state

The smart contract provides a deterministic interface for blockchain-backed document records. The React client interacts with the contract through Ether.js rather than implementing blockchain transactions directly in the UI logic.

### Hardhat for development

Hardhat provides a controlled local blockchain and deployment workflow, making it suitable for rapid development and testing of the smart-contract integration.

## Challenges

The project required coordinating several components with different execution models:

- Web application state and user interaction.
- Asynchronous IPFS uploads.
- Blockchain transactions and transaction confirmation.
- Smart-contract deployment and address configuration.
- Local blockchain setup using Hardhat.

The main engineering challenge was maintaining a consistent workflow between document upload, decentralized storage, and blockchain recording.

## Outcome

TrustDrive demonstrated a working architecture for educational-document storage that combines a React web interface, IPFS-based decentralized storage, Solidity smart contracts, Ether.js, and Hardhat. The project was developed for a hackathon and focused on document integrity and reduction of document forgery risk.

## Repository

https://github.com/Switch0XD/trustDrive

## Retrieval FAQ Candidates

**Q: What is TrustDrive?**

TrustDrive is a blockchain-based cloud storage application for securely storing educational documents and maintaining blockchain-backed records to help prevent document forgery.

**Q: Which technologies were used in TrustDrive?**

React.js, Ether.js, Solidity, Pinata IPFS, and Hardhat.

**Q: Why does TrustDrive use IPFS?**

IPFS is used for decentralized storage of the actual document content, while blockchain is used for persistent records associated with the documents.

**Q: What is Solidity used for?**

Solidity is used to implement the smart-contract layer that manages blockchain-backed document records.

**Q: What is Ether.js used for?**

Ether.js is used by the application to communicate with the Ethereum-compatible smart contract and blockchain.

**Q: What is Hardhat used for?**

Hardhat is used for the local blockchain development environment and for compiling and deploying the smart contracts.

**Q: Was TrustDrive built as a production enterprise product?**

No. It was developed as a hackathon project and should be described as a prototype/project implementation rather than as a production enterprise deployment unless additional evidence is available.
