# VestingCloak: A Confidential Token Vesting Solution

VestingCloak is a privacy-preserving application designed for confidential token vesting, leveraging Zama's Fully Homomorphic Encryption (FHE) technology. This cutting-edge solution enables the secure management of token vesting schedules, ensuring that details such as unlocking times and amounts remain hidden from outsiders, thereby protecting sensitive financial information and preventing market disruption.

## The Problem

In the world of decentralized finance (DeFi), transparency is crucial, but it often comes at the cost of user privacy. Traditional token vesting strategies expose critical details about unlocking schedules and quantities, which can lead to speculation and market volatility. When sensitive information is publicly available, it opens the door for manipulation and panic selling, potentially causing substantial losses for both projects and investors. Moreover, the lack of robust privacy measures can hinder widespread adoption, as participants may be unwilling to commit their assets without guarantees of confidentiality.

## The Zama FHE Solution

Zama's FHE technology provides a remarkable solution to these privacy challenges. By enabling computation on encrypted data, VestingCloak allows developers to implement complex vesting logic without revealing any cleartext information. Using fhevm to process encrypted inputs, the application ensures that even while performing calculations, all sensitive data remains confidential.

VestingCloak encrypts vesting schedules and unlocking logic, empowering users to confidently engage in token allocations without fear of external scrutiny or manipulation. This approach not only protects individual investor interests but also stabilizes the overall market environment by minimizing the risk of panic induced by disclosed vesting timelines.

## Key Features

- 🔒 **Encrypted Vesting Schedules**: All vesting timelines are encrypted, ensuring that only authorized parties can access the information.
- ⚙️ **Secure Unlocking Logic**: Utilizing homomorphic encryption, the unlocking logic is executed without revealing any underlying details.
- 📊 **Progress Tracking**: Users can monitor vesting statuses securely, without exposing sensitive information to potential attackers.
- 💼 **Confidential Compensation Structures**: Employees and participants can receive tokens without concerns regarding public exposure of their compensation packages.
- 🔑 **Market Stability**: By concealing key information, VestingCloak helps prevent market panic, promoting a healthier trading environment.

## Technical Architecture & Stack

- **Core Engine**: Zama's FHE (fhevm)
- **Programming Languages**: Solidity and JavaScript
- **Frameworks**: Hardhat for development and testing
- **Other Libraries**: Zama libraries for homomorphic encryption and secure computations

## Smart Contract / Core Logic

Below is a simplified example of a smart contract function that demonstrates how VestingCloak uses Zama's FHE library to perform encrypted calculations:

```solidity
pragma solidity ^0.8.0;

import "Zama/fhevm.sol";

contract VestingCloak {
    struct VestingSchedule {
        uint64 amount;  // Encrypted amount
        uint64 unlockTime; // Encrypted unlock time
    }

    mapping(address => VestingSchedule) private vestingSchedules;

    function createVestingSchedule(address beneficiary, uint64 encryptedAmount, uint64 encryptedUnlockTime) public {
        vestingSchedules[beneficiary] = VestingSchedule(encryptedAmount, encryptedUnlockTime);
    }

    function unlockTokens(address beneficiary) public {
        VestingSchedule storage schedule = vestingSchedules[beneficiary];
        if (TFHE.decrypt(schedule.unlockTime) <= block.timestamp) {
            // Allow withdrawal of tokens
        }
    }
}
```

## Directory Structure

The following is the directory structure for the VestingCloak project:

```
VestingCloak/
│
├── contracts/
│   ├── VestingCloak.sol
│
├── scripts/
│   ├── deploy.js
│
├── tests/
│   ├── VestingCloak.test.js
│
├── README.md
└── package.json
```

## Installation & Setup

To get started with VestingCloak, follow these steps:

### Prerequisites

- Node.js (version 14 or later)
- npm (Node Package Manager)
- Hardhat (for Ethereum development)

### Installation Steps

1. **Install Dependencies**: Run the following command to install the required dependencies:
   ```bash
   npm install
   ```

2. **Install Zama's FHE Library**: Specifically, install the Zama FHE library to enable homomorphic encryption functionality:
   ```bash
   npm install fhevm
   ```

## Build & Run

Once the installation is complete, you can build and run VestingCloak using the following commands:

1. **Compile the Smart Contracts**: 
   ```bash
   npx hardhat compile
   ```

2. **Run Tests**: To ensure everything is functioning correctly, run your test suite:
   ```bash
   npx hardhat test
   ```

3. **Deploy the Contract**: You can deploy the smart contract to your desired Ethereum network:
   ```bash
   npx hardhat run scripts/deploy.js --network yourNetwork
   ```

## Acknowledgements

We would like to extend our gratitude to Zama for providing the open-source FHE primitives that make this project possible. Their innovative technology paves the way for enhanced privacy and security in the blockchain space, enabling projects like VestingCloak to thrive in a competitive landscape.

