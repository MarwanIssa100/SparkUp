'use client';
import { useAccount, useReadContract, useWriteContract, usePublicClient } from 'wagmi';
import { SparkUp } from '@/src/contracts/SparkUp';
import { formatEther, parseEther } from 'viem';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSafePublicClient } from '@/hooks/useSafePublicClient';


export default function Home() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [goal, setGoal] = useState('');
  const [fundAmount, setFundAmount] = useState('');
  const [selectedIdea, setSelectedIdea] = useState<number | null>(null); 

  // Read all ideas
  const { data: totalIdeas } = useReadContract({
    ...SparkUp,
    functionName: 'totalIdeas',
  });

  type Idea = {
    id: number
    title: string
    description: string
    owner: string
    fundGoal: bigint
    deadline: bigint
    amountCollected: bigint
    completed: boolean
  }

  const { 
    writeContract: completeIdea,
    isPending: isCompleting,
    isSuccess: isCompleteSuccess
  } = useWriteContract();

  const handleComplete = (ideaId: number) => {
    if (!ideaId) return;
    
    completeIdea({
      address: SparkUp.address,
      abi: SparkUp.abi,
      functionName: 'completeIdea',
      args: [BigInt(ideaId)],
    });
  };

  // Show success message
  useEffect(() => {
    if (isCompleteSuccess) {
      alert('Idea marked as completed successfully!');
    }
  }, [isCompleteSuccess]);

  const publicClient = useSafePublicClient()
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Fetch all ideas
  useEffect(() => {
    const fetchIdeas = async () => {
      if (totalIdeas === undefined) return
      
      setIsLoading(true)
      setError(null)

      try {
        const ideaPromises = []
        const count = Number(totalIdeas)

        // Create parallel requests using publicClient
        for (let i = 1; i <= count; i++) {
          ideaPromises.push(
            publicClient.readContract({
              address: SparkUp.address,
              abi: SparkUp.abi,
              functionName: 'getIdea',
              args: [BigInt(i)],
            })
          )
        }
        // Wait for all requests to complete
        const results = await Promise.all(ideaPromises)

        // Transform and filter results
        const fetchedIdeas = results
          .map((data, index) => 
            data ? {
              id: index + 1,
              title: data[0],
              description: data[1],
              owner: data[2],
              fundGoal: data[3],
              deadline: data[4],
              amountCollected: data[5],
              completed: data[6],
            } : null
          )
          .filter(Boolean) as Idea[]

        setIdeas(fetchedIdeas)
      } catch (err) {
        console.error('Error fetching ideas:', err)
        setError('Failed to load ideas')
      } finally {
        setIsLoading(false)
      }
    }

    fetchIdeas()
  }, [totalIdeas]) 

  // Create idea

  const {
  writeContract,
  isPending: isCreating,
  isSuccess: isCreateSuccess,
  data: createTxHash
} = useWriteContract();

const handleCreateIdea = async () => {
  if (!title || !description || !goal) {
    alert('Please fill all required fields');
    return;
  }

  try {
    const deadline = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
    const fundGoalInWei = parseEther(goal.toString());
    
    // Optimistically add the new idea
    const optimisticIdea: Idea = {
      id: ideas.length + 1,
      title,
      description,
      owner: address || '', // Current user's address
      fundGoal: fundGoalInWei,
      deadline: BigInt(deadline),
      amountCollected: BigInt(0),
      completed: false,
    };
    
    setIdeas(prev => [...prev, optimisticIdea]);
    setTitle('');
    setDescription('');
    setGoal('');

    // Then send the transaction
    await writeContract({
      address: SparkUp.address,
      abi: SparkUp.abi,
      functionName: 'createIdea',
      args: [title, description, fundGoalInWei, BigInt(deadline)],
    });

  } catch (error) {
    console.error('Error creating idea:', error);
    // Rollback optimistic update if transaction fails
    setIdeas(prev => prev.slice(0, -1));
    alert('Failed to create idea. See console for details.');
  }
};

// Handle successful creation (fallback in case optimistic update misses something)
useEffect(() => {
  if (isCreateSuccess && totalIdeas) {
    const fetchNewIdea = async () => {
      const newIdeaData = await publicClient.readContract({
        address: SparkUp.address,
        abi: SparkUp.abi,
        functionName: 'getIdea',
        args: [totalIdeas], // Get the last idea
      });

        setIdeas(prev => prev.map(idea => 
        idea.id === Number(totalIdeas) ? {
          ...idea,
          ...newIdeaData
        } : idea
      ));
    };
    fetchNewIdea();
  }
}, [isCreateSuccess, totalIdeas]);

  // Fund idea
  const { 
    writeContract: fundIdea,
    isPending: isFunding 
  } = useWriteContract();

  // Withdraw funds
  const { 
    writeContract: withdrawFunds,
    isPending: isWithdrawing 
  } = useWriteContract();

  // Refund
  const [userContribution, setUserContribution] = useState<bigint>(BigInt(0)); 
  const [isRefunding, setIsRefunding] = useState(false);
  const [refundError, setRefundError] = useState<Error | null>(null);
  const [refundTxHash, setRefundTxHash] = useState<string | null>(null);

  const handleRefund = async (ideaId: number) => {
    if (!address) {
      alert('Please connect your wallet');
      return;
    }

    setIsRefunding(true);
    setRefundError(null);

    try {
      const txHash = await writeContract({
        address: SparkUp.address,
        abi: SparkUp.abi,
        functionName: 'refund',
        args: [BigInt(ideaId), address],
      });
    } catch (error) {
      setRefundError(error as Error);
    } finally {
      setIsRefunding(false);
    }
  };

  const handleFundIdea = () => {
    if (!selectedIdea || !fundAmount) return;
    fundIdea({
      ...SparkUp,
      functionName: 'fundIdea',
      args: [BigInt(selectedIdea)],
      value: parseEther(fundAmount),
    });
  };

  const handleWithdraw = (ideaId: number) => {
    withdrawFunds({
      ...SparkUp,
      functionName: 'withdraw',
      args: [BigInt(ideaId)],
    });
  };

  return (
    <main className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-8">SparkUp</h1>
      {!isConnected ? (
        <w3m-button />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Create Idea Form */}
            <section className="mb-12 p-6 rounded-lg shadow-md">
              <h2 className="text-2xl font-semibold mb-6">Create New Idea</h2>
              <div className="space-y-6">
                <div>
                  <label htmlFor="title" className="block text-sm font-medium mb-1">
                    Title*
                  </label>
                  <input
                    id="title"
                    type="text"
                    placeholder="My Awesome Project"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label htmlFor="description" className="block text-sm font-medium mb-1">
                    Description*
                  </label>
                  <textarea
                    id="description"
                    placeholder="Describe your idea in detail..."
                    rows={4}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label htmlFor="fundingGoal" className="block text-sm font-medium mb-1">
                    Funding Goal (ETH)*
                  </label>
                  <input
                    id="fundingGoal"
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="1.00"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={goal}
                    onChange={(e) => {
                      if (parseFloat(e.target.value) >= 0) {
                        setGoal(e.target.value)
                      }
                    }}
                    required
                  />
                </div>

                <button
                  onClick={handleCreateIdea}
                  disabled={isCreating || !title || !description || !goal}
                  className={`w-full py-3 px-4 rounded-lg font-medium text-white transition-colors ${
                    isCreating 
                      ? 'bg-gray-400 cursor-not-allowed'
                      : (!title || !description || !goal)
                        ? 'bg-blue-400 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {isCreating ? (
                    <span className="flex items-center justify-center">
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Creating...
                    </span>
                  ) : 'Create Idea'}
                </button>

                {createTxHash && (
                  <div className="mt-4 p-3 bg-green-50 text-green-700 rounded-lg text-sm">
                    Transaction submitted!{' '}
                    <a 
                      href={`https://sepolia.scrollscan.com//tx/${createTxHash}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-green-600 underline hover:text-green-800"
                    >
                      View on Scroll Scan
                    </a>
                  </div>
                )}
              </div>
            </section>

            {/* Fund Idea Section */}
            <section className="mb-12 p-6 rounded-lg">
              <h2 className="text-xl font-semibold mb-4">Fund an Idea</h2>
              <div className="flex space-x-4 ">
                <select
                  className="p-2 border rounded flex-1"
                  value={selectedIdea ?? ''}
                  onChange={(e) => setSelectedIdea(Number(e.target.value))}
                >
                  <option className="bg-black" value="">Select an idea</option>
                  {ideas.map((idea) => (
                    <option className="bg-black" key={idea.id} value={idea.id}>
                      {idea.title} (Goal: {formatEther(idea.fundGoal)} ETH)
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  placeholder="Amount (ETH)"
                  className="p-2 border rounded w-32"
                  value={fundAmount}
                  onChange={(e) => setFundAmount(e.target.value)}
                />
                <button
                  onClick={handleFundIdea}
                  disabled={!selectedIdea || isFunding}
                  className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 disabled:bg-gray-400"
                >
                  {isFunding ? 'Funding...' : 'Fund'}
                </button>
              </div>
            </section>
          </div>

          {/* Ideas List */}
          <section>
            <h2 className="text-xl font-semibold mb-4">All Ideas</h2>
            {isLoading ? (
              <div className="text-center py-8 text-gray-500">Loading ideas...</div>
            ) : error ? (
              <div className="text-center py-8 text-red-500">{error}</div>
            ) : ideas && ideas.length > 0 ? (
              <div className="grid grid-cols-1 gap-4">
                {ideas.map(idea => {
                  const fundGoal = Number(idea.fundGoal);
                  const amountCollected = Number(idea.amountCollected);
                  const deadline = Number(idea.deadline);
                  const progress = fundGoal > 0 
                    ? Math.min(100, (amountCollected / fundGoal) * 100)
                    : 0;

                  return (
                    <div key={idea.id} className="p-4 border rounded-lg">
                      <h3 className="text-xl font-bold">{idea.title || 'Untitled Idea'}</h3>
                      <p className="text-gray-600">{idea.description || 'No description provided'}</p>
                      
                      {/* Progress bar */}
                      <div className="mt-4">
                        <div className="w-full bg-gray-200 rounded-full h-2.5 mb-2">
                          <div 
                            className="bg-green-500 h-2.5 rounded-full" 
                            style={{ width: `${progress.toFixed(2)}%` }}
                          ></div>
                        </div>
                        <div className="flex justify-between text-sm font-medium text-gray-600">
                          <span>{formatEther(idea.amountCollected)} ETH raised</span>
                          <span>{formatEther(idea.fundGoal)} ETH goal</span>
                        </div>
                      </div>

                      <div className="mt-2 space-y-1">
                        <p>Deadline: {new Date(deadline * 1000).toLocaleDateString()}</p>
                        <p className="text-sm">Status: {idea.completed ? 'Completed' : 'Active'}</p>
                        <p className="text-sm">Owner: {idea.owner.slice(0, 6)}...{idea.owner.slice(-4)}</p>
                      </div>

                      {/* Owner actions */}
                      {address && address.toLowerCase() === idea.owner.toLowerCase() && !idea.completed && (
                        <div className="flex space-x-2 mt-4">
                          {amountCollected > 0 && (
                            <button
                              onClick={() => handleWithdraw(idea.id)}
                              disabled={isWithdrawing}
                              className="bg-purple-500 text-white px-3 py-1 rounded text-sm hover:bg-purple-600 disabled:bg-gray-400"
                            >
                              {isWithdrawing ? 'Withdrawing...' : 'Withdraw'}
                            </button>
                          )}
                          <button
                            onClick={() => handleComplete(idea.id)}
                            disabled={isCompleting}
                            className="bg-gray-500 text-white px-3 py-1 rounded text-sm hover:bg-gray-600 disabled:bg-gray-400"
                          >
                            {isCompleting ? 'Completing...' : 'Mark Complete'}
                          </button>
                        </div>
                      )}

                      {/* Refund Section */}
                      <div className="p-6 rounded-lg">
                        <h2 className="text-xl font-semibold mb-4">Refund</h2>
                        
                        {idea.owner.toLowerCase() !== address?.toLowerCase() && (
                          <div className="space-y-4">
                            <button
                              onClick={() => handleRefund(idea.id)}
                              disabled={isRefunding}
                              className={`w-50px py-2 px-4 rounded-md text-white ${
                                isRefunding
                                  ? 'bg-gray-400 cursor-not-allowed'
                                  : 'bg-red-500 hover:bg-red-600'
                              }`}
                            >
                              {isRefunding ? 'Processing Refund...' : 'Request Refund'}
                            </button>

                            {refundError && (
                              <p className="text-red-500 text-sm mt-2">
                                Error: {refundError.message}
                              </p>
                            )}

                            {refundTxHash && (
                              <div className="mt-4 p-3 bg-green-50 text-green-700 rounded-lg text-sm">
                                Refund initiated!{' '}
                                <a
                                  href={`https://sepolia.scrollscan.com//tx/${refundTxHash}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline hover:text-green-800"
                                >
                                  View transaction
                                </a>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Message for idea owner */}
                        {idea.owner.toLowerCase() === address?.toLowerCase() && (
                          <p className="text-gray-500">
                            As the creator of this idea, you cannot request refunds.
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                No ideas found. Create one to get started!
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}