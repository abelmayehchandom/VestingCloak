import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';

interface VestingPlan {
  id: string;
  name: string;
  totalTokens: number;
  unlockedTokens: number;
  startTime: number;
  cliffPeriod: number;
  vestingPeriod: number;
  beneficiary: string;
  creator: string;
  timestamp: number;
  isVerified?: boolean;
  decryptedValue?: number;
  encryptedValueHandle?: string;
}

interface VestingStats {
  totalPlans: number;
  activePlans: number;
  totalValue: number;
  avgVesting: number;
  completionRate: number;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<VestingPlan[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingPlan, setCreatingPlan] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending", 
    message: "" 
  });
  const [newPlanData, setNewPlanData] = useState({ 
    name: "", 
    totalTokens: "", 
    cliffPeriod: "", 
    vestingPeriod: "" 
  });
  const [selectedPlan, setSelectedPlan] = useState<VestingPlan | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(5);
  const [userHistory, setUserHistory] = useState<string[]>([]);
  const [stats, setStats] = useState<VestingStats>({
    totalPlans: 0,
    activePlans: 0,
    totalValue: 0,
    avgVesting: 0,
    completionRate: 0
  });

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected || isInitialized) return;
      
      try {
        console.log('Initializing FHEVM for confidential vesting...');
        await initialize();
        console.log('FHEVM initialized successfully');
      } catch (error) {
        console.error('Failed to initialize FHEVM:', error);
        setTransactionStatus({ 
          visible: true, 
          status: "error", 
          message: "FHEVM initialization failed" 
        });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      }
    };

    initFhevmAfterConnection();
  }, [isConnected, isInitialized, initialize]);

  useEffect(() => {
    const loadData = async () => {
      if (!isConnected) {
        setLoading(false);
        return;
      }
      
      try {
        await loadVestingPlans();
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [isConnected]);

  const loadVestingPlans = async () => {
    if (!isConnected) return;
    
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const businessIds = await contract.getAllBusinessIds();
      const plansList: VestingPlan[] = [];
      
      for (const businessId of businessIds) {
        try {
          const businessData = await contract.getBusinessData(businessId);
          plansList.push({
            id: businessId,
            name: businessData.name,
            totalTokens: Number(businessData.publicValue1) || 0,
            unlockedTokens: 0,
            startTime: Number(businessData.timestamp),
            cliffPeriod: 30,
            vestingPeriod: Number(businessData.publicValue2) || 365,
            beneficiary: businessData.creator,
            creator: businessData.creator,
            timestamp: Number(businessData.timestamp),
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0
          });
        } catch (e) {
          console.error('Error loading business data:', e);
        }
      }
      
      setPlans(plansList);
      calculateStats(plansList);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load vesting plans" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
    }
  };

  const calculateStats = (plansList: VestingPlan[]) => {
    const totalPlans = plansList.length;
    const activePlans = plansList.filter(p => p.startTime * 1000 > Date.now()).length;
    const totalValue = plansList.reduce((sum, p) => sum + p.totalTokens, 0);
    const avgVesting = totalPlans > 0 ? totalValue / totalPlans : 0;
    const completionRate = totalPlans > 0 ? (plansList.filter(p => p.isVerified).length / totalPlans) * 100 : 0;

    setStats({
      totalPlans,
      activePlans,
      totalValue,
      avgVesting,
      completionRate
    });
  };

  const createVestingPlan = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingPlan(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Creating confidential vesting plan..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const tokenValue = parseInt(newPlanData.totalTokens) || 0;
      const businessId = `vesting-${Date.now()}`;
      
      const encryptedResult = await encrypt(await contract.getAddress(), address, tokenValue);
      
      const tx = await contract.createBusinessData(
        businessId,
        newPlanData.name,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        tokenValue,
        parseInt(newPlanData.vestingPeriod) || 365,
        "Confidential Token Vesting Plan"
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Encrypting token allocation..." });
      await tx.wait();
      
      setUserHistory(prev => [...prev, `Created vesting plan: ${newPlanData.name}`]);
      setTransactionStatus({ visible: true, status: "success", message: "Vesting plan created confidentially! 🔐" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadVestingPlans();
      setShowCreateModal(false);
      setNewPlanData({ name: "", totalTokens: "", cliffPeriod: "", vestingPeriod: "" });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "Transaction rejected" 
        : "Creation failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingPlan(false); 
    }
  };

  const decryptTokens = async (businessId: string): Promise<number | null> => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const businessData = await contractRead.getBusinessData(businessId);
      if (businessData.isVerified) {
        const storedValue = Number(businessData.decryptedValue) || 0;
        setTransactionStatus({ visible: true, status: "success", message: "Tokens already verified 🔓" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        return storedValue;
      }
      
      const contractWrite = await getContractWithSigner();
      if (!contractWrite) return null;
      
      const encryptedValueHandle = await contractRead.getEncryptedValue(businessId);
      
      const result = await verifyDecryption(
        [encryptedValueHandle],
        await contractRead.getAddress(),
        (abiEncodedClearValues: string, decryptionProof: string) => 
          contractWrite.verifyDecryption(businessId, abiEncodedClearValues, decryptionProof)
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Verifying token decryption..." });
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      await loadVestingPlans();
      setUserHistory(prev => [...prev, `Decrypted tokens for plan: ${businessId}`]);
      
      setTransactionStatus({ visible: true, status: "success", message: "Tokens decrypted confidentially! 🔓" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        setTransactionStatus({ visible: true, status: "success", message: "Tokens already verified" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        await loadVestingPlans();
        return null;
      }
      
      setTransactionStatus({ visible: true, status: "error", message: "Decryption failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
  };

  const testAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const available = await contract.isAvailable();
      if (available) {
        setTransactionStatus({ visible: true, status: "success", message: "FHE System Available ✅" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
      }
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Availability check failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const filteredPlans = plans.filter(plan => {
    const matchesSearch = plan.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         plan.beneficiary.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === "all" || 
                         (filterStatus === "verified" && plan.isVerified) ||
                         (filterStatus === "pending" && !plan.isVerified);
    return matchesSearch && matchesFilter;
  });

  const paginatedPlans = filteredPlans.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const totalPages = Math.ceil(filteredPlans.length / itemsPerPage);

  const calculateVestingProgress = (plan: VestingPlan) => {
    const now = Date.now() / 1000;
    const elapsed = Math.max(0, now - plan.startTime);
    const totalDuration = plan.vestingPeriod * 24 * 60 * 60;
    return Math.min(100, (elapsed / totalDuration) * 100);
  };

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo-section">
            <div className="logo-icon">🔒</div>
            <h1>VestingCloak</h1>
            <span className="tagline">Confidential Token Vesting</span>
          </div>
          <div className="header-actions">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="prompt-content">
            <div className="prompt-icon">🔐</div>
            <h2>Connect Wallet to Access Confidential Vesting</h2>
            <p>Secure your token vesting schedules with FHE encryption</p>
            <div className="feature-grid">
              <div className="feature-item">
                <span className="feature-number">1</span>
                <div className="feature-text">
                  <strong>Encrypted Allocation</strong>
                  <p>Token amounts hidden with FHE</p>
                </div>
              </div>
              <div className="feature-item">
                <span className="feature-number">2</span>
                <div className="feature-text">
                  <strong>Private Schedules</strong>
                  <p>Unlock timelines remain confidential</p>
                </div>
              </div>
              <div className="feature-item">
                <span className="feature-number">3</span>
                <div className="feature-text">
                  <strong>Market Protection</strong>
                  <p>Prevent dumping expectations</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized) {
    return (
      <div className="loading-screen">
        <div className="encryption-animation">
          <div className="lock-icon">🔒</div>
          <div className="encryption-wave"></div>
        </div>
        <p>Initializing FHE Encryption System...</p>
        <p className="status-text">Status: {status}</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="encryption-animation">
        <div className="lock-icon">🔒</div>
        <div className="encryption-wave"></div>
      </div>
      <p>Loading Confidential Vesting Plans...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo-section">
          <div className="logo-icon">🔒</div>
          <div>
            <h1>VestingCloak</h1>
            <span className="tagline">FHE-Protected Token Vesting</span>
          </div>
        </div>
        
        <div className="header-actions">
          <button className="test-btn" onClick={testAvailability}>
            Test FHE System
          </button>
          <button 
            className="create-btn"
            onClick={() => setShowCreateModal(true)}
          >
            + New Vesting Plan
          </button>
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
        </div>
      </header>

      <div className="main-layout">
        <div className="stats-panel">
          <div className="panel-header">
            <h3>Vesting Overview</h3>
            <button 
              className="refresh-btn"
              onClick={loadVestingPlans}
              disabled={isRefreshing}
            >
              {isRefreshing ? "🔄" : "↻"}
            </button>
          </div>
          
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon">📊</div>
              <div className="stat-value">{stats.totalPlans}</div>
              <div className="stat-label">Total Plans</div>
            </div>
            
            <div className="stat-card">
              <div className="stat-icon">🔐</div>
              <div className="stat-value">{stats.activePlans}</div>
              <div className="stat-label">Active</div>
            </div>
            
            <div className="stat-card">
              <div className="stat-icon">💰</div>
              <div className="stat-value">{stats.totalValue.toLocaleString()}</div>
              <div className="stat-label">Total Value</div>
            </div>
            
            <div className="stat-card">
              <div className="stat-icon">✅</div>
              <div className="stat-value">{stats.completionRate.toFixed(1)}%</div>
              <div className="stat-label">Verified</div>
            </div>
          </div>
        </div>

        <div className="content-panel">
          <div className="panel-toolbar">
            <div className="search-section">
              <input
                type="text"
                placeholder="Search plans..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
              <select 
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="filter-select"
              >
                <option value="all">All Plans</option>
                <option value="verified">Verified</option>
                <option value="pending">Pending</option>
              </select>
            </div>
            
            <div className="pagination-controls">
              <button 
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="page-btn"
              >
                ←
              </button>
              <span className="page-info">Page {currentPage} of {totalPages}</span>
              <button 
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="page-btn"
              >
                →
              </button>
            </div>
          </div>

          <div className="plans-list">
            {paginatedPlans.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">🔒</div>
                <h3>No vesting plans found</h4>
                <p>Create your first confidential vesting plan to get started</p>
                <button 
                  className="create-btn"
                  onClick={() => setShowCreateModal(true)}
                >
                  Create Vesting Plan
                </button>
              </div>
            ) : (
              paginatedPlans.map((plan) => (
                <div 
                  key={plan.id}
                  className={`plan-item ${plan.isVerified ? 'verified' : 'encrypted'}`}
                  onClick={() => setSelectedPlan(plan)}
                >
                  <div className="plan-header">
                    <h4>{plan.name}</h4>
                    <span className={`status-badge ${plan.isVerified ? 'verified' : 'encrypted'}`}>
                      {plan.isVerified ? '🔓 Verified' : '🔐 Encrypted'}
                    </span>
                  </div>
                  
                  <div className="plan-progress">
                    <div className="progress-bar">
                      <div 
                        className="progress-fill"
                        style={{ width: `${calculateVestingProgress(plan)}%` }}
                      ></div>
                    </div>
                    <span className="progress-text">
                      {calculateVestingProgress(plan).toFixed(1)}% Vested
                    </span>
                  </div>
                  
                  <div className="plan-details">
                    <div className="detail-item">
                      <span>Beneficiary:</span>
                      <span>{plan.beneficiary.substring(0, 8)}...{plan.beneficiary.substring(34)}</span>
                    </div>
                    <div className="detail-item">
                      <span>Vesting Period:</span>
                      <span>{plan.vestingPeriod} days</span>
                    </div>
                    <div className="detail-item">
                      <span>Created:</span>
                      <span>{new Date(plan.timestamp * 1000).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="history-panel">
          <div className="panel-header">
            <h3>Operation History</h3>
          </div>
          <div className="history-list">
            {userHistory.slice(-10).map((entry, index) => (
              <div key={index} className="history-item">
                <span className="history-time">{new Date().toLocaleTimeString()}</span>
                <span className="history-action">{entry}</span>
              </div>
            ))}
            {userHistory.length === 0 && (
              <div className="empty-history">No operations yet</div>
            )}
          </div>
        </div>
      </div>

      {showCreateModal && (
        <CreateVestingModal
          onSubmit={createVestingPlan}
          onClose={() => setShowCreateModal(false)}
          creating={creatingPlan}
          planData={newPlanData}
          setPlanData={setNewPlanData}
          isEncrypting={isEncrypting}
        />
      )}

      {selectedPlan && (
        <PlanDetailModal
          plan={selectedPlan}
          onClose={() => setSelectedPlan(null)}
          decryptTokens={() => decryptTokens(selectedPlan.id)}
          isDecrypting={fheIsDecrypting}
          calculateProgress={calculateVestingProgress}
        />
      )}

      {transactionStatus.visible && (
        <div className={`transaction-toast ${transactionStatus.status}`}>
          <div className="toast-content">
            <span className="toast-icon">
              {transactionStatus.status === "pending" && "⏳"}
              {transactionStatus.status === "success" && "✅"}
              {transactionStatus.status === "error" && "❌"}
            </span>
            <span>{transactionStatus.message}</span>
          </div>
        </div>
      )}
    </div>
  );
};

const CreateVestingModal: React.FC<{
  onSubmit: () => void;
  onClose: () => void;
  creating: boolean;
  planData: any;
  setPlanData: (data: any) => void;
  isEncrypting: boolean;
}> = ({ onSubmit, onClose, creating, planData, setPlanData, isEncrypting }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setPlanData({ ...planData, [name]: value });
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal">
        <div className="modal-header">
          <h2>Create Confidential Vesting Plan</h2>
          <button onClick={onClose} className="close-btn">×</button>
        </div>
        
        <div className="modal-body">
          <div className="encryption-notice">
            <div className="notice-icon">🔐</div>
            <div className="notice-content">
              <strong>FHE Encryption Active</strong>
              <p>Token amounts will be encrypted using Zama FHE technology</p>
            </div>
          </div>

          <div className="form-group">
            <label>Plan Name *</label>
            <input
              type="text"
              name="name"
              value={planData.name}
              onChange={handleChange}
              placeholder="Employee Token Vesting"
            />
          </div>

          <div className="form-group">
            <label>Total Tokens (FHE Encrypted) *</label>
            <input
              type="number"
              name="totalTokens"
              value={planData.totalTokens}
              onChange={handleChange}
              placeholder="100000"
              min="1"
            />
            <span className="input-hint">Encrypted integer only</span>
          </div>

          <div className="form-group">
            <label>Vesting Period (Days) *</label>
            <input
              type="number"
              name="vestingPeriod"
              value={planData.vestingPeriod}
              onChange={handleChange}
              placeholder="365"
              min="1"
            />
          </div>

          <div className="form-group">
            <label>Cliff Period (Days)</label>
            <input
              type="number"
              name="cliffPeriod"
              value={planData.cliffPeriod}
              onChange={handleChange}
              placeholder="30"
              min="0"
            />
          </div>
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn">Cancel</button>
          <button 
            onClick={onSubmit}
            disabled={creating || isEncrypting || !planData.name || !planData.totalTokens}
            className="submit-btn"
          >
            {creating || isEncrypting ? "Encrypting..." : "Create Plan"}
          </button>
        </div>
      </div>
    </div>
  );
};

const PlanDetailModal: React.FC<{
  plan: VestingPlan;
  onClose: () => void;
  decryptTokens: () => Promise<number | null>;
  isDecrypting: boolean;
  calculateProgress: (plan: VestingPlan) => number;
}> = ({ plan, onClose, decryptTokens, isDecrypting, calculateProgress }) => {
  const progress = calculateProgress(plan);

  const handleDecrypt = async () => {
    await decryptTokens();
  };

  return (
    <div className="modal-overlay">
      <div className="detail-modal">
        <div className="modal-header">
          <h2>Vesting Plan Details</h2>
          <button onClick={onClose} className="close-btn">×</button>
        </div>

        <div className="modal-body">
          <div className="plan-header">
            <h3>{plan.name}</h3>
            <span className={`status-badge large ${plan.isVerified ? 'verified' : 'encrypted'}`}>
              {plan.isVerified ? '🔓 Decrypted' : '🔐 Encrypted'}
            </span>
          </div>

          <div className="progress-section">
            <div className="progress-header">
              <span>Vesting Progress</span>
              <span>{progress.toFixed(1)}%</span>
            </div>
            <div className="progress-bar large">
              <div 
                className="progress-fill"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          </div>

          <div className="details-grid">
            <div className="detail-card">
              <span className="detail-label">Total Tokens</span>
              <span className="detail-value">
                {plan.isVerified ? 
                  `${plan.decryptedValue?.toLocaleString()} 🔓` : 
                  '🔐 Encrypted'
                }
              </span>
            </div>

            <div className="detail-card">
              <span className="detail-label">Vesting Period</span>
              <span className="detail-value">{plan.vestingPeriod} days</span>
            </div>

            <div className="detail-card">
              <span className="detail-label">Start Date</span>
              <span className="detail-value">{new Date(plan.startTime * 1000).toLocaleDateString()}</span>
            </div>

            <div className="detail-card">
              <span className="detail-label">Beneficiary</span>
              <span className="detail-value address">{plan.beneficiary}</span>
            </div>
          </div>

          {!plan.isVerified && (
            <div className="decryption-section">
              <div className="decryption-notice">
                <div className="notice-icon">🔒</div>
                <div>
                  <strong>Confidential Token Allocation</strong>
                  <p>Token amounts are encrypted using FHE. Decrypt to reveal actual allocation.</p>
                </div>
              </div>
              
              <button 
                onClick={handleDecrypt}
                disabled={isDecrypting}
                className="decrypt-btn"
              >
                {isDecrypting ? "Decrypting..." : "Decrypt Token Amount"}
              </button>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="close-btn">Close</button>
          {!plan.isVerified && (
            <button 
              onClick={handleDecrypt}
              disabled={isDecrypting}
              className="action-btn"
            >
              {isDecrypting ? "⏳ Decrypting..." : "🔓 Decrypt"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;

