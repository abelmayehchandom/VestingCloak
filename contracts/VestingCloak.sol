pragma solidity ^0.8.24;

import { FHE, euint32, externalEuint32 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract VestingCloak is ZamaEthereumConfig {
    struct VestingSchedule {
        address beneficiary;
        euint32 encryptedAmount;
        euint32 encryptedUnlockTime;
        uint256 cliffPeriod;
        uint256 duration;
        bool isRevoked;
        uint32 decryptedAmount;
        uint32 decryptedUnlockTime;
        bool isVerified;
    }

    mapping(address => VestingSchedule) public vestingSchedules;
    address[] public beneficiaries;

    event VestingCreated(address indexed beneficiary);
    event VestingRevoked(address indexed beneficiary);
    event VestingUnlocked(address indexed beneficiary, uint32 amount);
    event DecryptionVerified(address indexed beneficiary, uint32 amount, uint32 unlockTime);

    constructor() ZamaEthereumConfig() {}

    function createVestingSchedule(
        address beneficiary,
        externalEuint32 encryptedAmount,
        externalEuint32 encryptedUnlockTime,
        bytes calldata amountProof,
        bytes calldata unlockTimeProof,
        uint256 cliffPeriod,
        uint256 duration
    ) external {
        require(vestingSchedules[beneficiary].beneficiary == address(0), "Vesting already exists");

        euint32 amount = FHE.fromExternal(encryptedAmount, amountProof);
        euint32 unlockTime = FHE.fromExternal(encryptedUnlockTime, unlockTimeProof);

        require(FHE.isInitialized(amount), "Invalid encrypted amount");
        require(FHE.isInitialized(unlockTime), "Invalid encrypted unlock time");

        vestingSchedules[beneficiary] = VestingSchedule({
            beneficiary: beneficiary,
            encryptedAmount: amount,
            encryptedUnlockTime: unlockTime,
            cliffPeriod: cliffPeriod,
            duration: duration,
            isRevoked: false,
            decryptedAmount: 0,
            decryptedUnlockTime: 0,
            isVerified: false
        });

        FHE.allowThis(amount);
        FHE.allowThis(unlockTime);
        FHE.makePubliclyDecryptable(amount);
        FHE.makePubliclyDecryptable(unlockTime);

        beneficiaries.push(beneficiary);

        emit VestingCreated(beneficiary);
    }

    function revokeVesting(address beneficiary) external {
        require(msg.sender == beneficiary, "Only beneficiary can revoke");
        require(!vestingSchedules[beneficiary].isRevoked, "Vesting already revoked");

        vestingSchedules[beneficiary].isRevoked = true;
        emit VestingRevoked(beneficiary);
    }

    function verifyDecryption(
        address beneficiary,
        bytes memory abiEncodedAmount,
        bytes memory abiEncodedUnlockTime,
        bytes memory decryptionProof
    ) external {
        require(vestingSchedules[beneficiary].beneficiary != address(0), "Vesting does not exist");
        require(!vestingSchedules[beneficiary].isVerified, "Decryption already verified");

        bytes32[] memory cts = new bytes32[](2);
        cts[0] = FHE.toBytes32(vestingSchedules[beneficiary].encryptedAmount);
        cts[1] = FHE.toBytes32(vestingSchedules[beneficiary].encryptedUnlockTime);

        FHE.checkSignatures(cts, abi.encode(abiEncodedAmount, abiEncodedUnlockTime), decryptionProof);

        uint32 amount = abi.decode(abiEncodedAmount, (uint32));
        uint32 unlockTime = abi.decode(abiEncodedUnlockTime, (uint32));

        vestingSchedules[beneficiary].decryptedAmount = amount;
        vestingSchedules[beneficiary].decryptedUnlockTime = unlockTime;
        vestingSchedules[beneficiary].isVerified = true;

        emit DecryptionVerified(beneficiary, amount, unlockTime);
    }

    function release() external {
        address beneficiary = msg.sender;
        VestingSchedule storage vesting = vestingSchedules[beneficiary];

        require(vesting.beneficiary != address(0), "No vesting schedule");
        require(!vesting.isRevoked, "Vesting revoked");
        require(vesting.isVerified, "Decryption not verified");
        require(block.timestamp >= vesting.decryptedUnlockTime, "Vesting not unlocked yet");

        uint32 amount = vesting.decryptedAmount;

        delete vestingSchedules[beneficiary];

        for (uint i = 0; i < beneficiaries.length; i++) {
            if (beneficiaries[i] == beneficiary) {
                beneficiaries[i] = beneficiaries[beneficiaries.length - 1];
                beneficiaries.pop();
                break;
            }
        }

        payable(beneficiary).transfer(amount);
        emit VestingUnlocked(beneficiary, amount);
    }

    function getVestingSchedule(address beneficiary) external view returns (
        euint32 encryptedAmount,
        euint32 encryptedUnlockTime,
        uint256 cliffPeriod,
        uint256 duration,
        bool isRevoked,
        uint32 decryptedAmount,
        uint32 decryptedUnlockTime,
        bool isVerified
    ) {
        VestingSchedule storage vesting = vestingSchedules[beneficiary];
        require(vesting.beneficiary != address(0), "Vesting does not exist");

        return (
            vesting.encryptedAmount,
            vesting.encryptedUnlockTime,
            vesting.cliffPeriod,
            vesting.duration,
            vesting.isRevoked,
            vesting.decryptedAmount,
            vesting.decryptedUnlockTime,
            vesting.isVerified
        );
    }

    function getAllBeneficiaries() external view returns (address[] memory) {
        return beneficiaries;
    }

    function isAvailable() public pure returns (bool) {
        return true;
    }
}

