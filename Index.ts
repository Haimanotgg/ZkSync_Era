import { ethers } from 'ethers';
import { BigNumber } from 'ethers';
import { providers } from 'ethers';
import { ContractTransaction } from 'ethers';
import { ContractReceipt } from 'ethers';
import { expect } from 'chai';
import hre from 'hardhat';
import {Contract} from 'ethers';
import '@nomiclabs/hardhat-ethers';
import '@nomicfoundation/hardhat-toolbox';
import dotenv from 'dotenv'
dotenv.config();

import { keccak256 } from 'ethers/lib/utils';
 
// PROVIDER , SIGNER , WALLET
const provider: ethers.providers.JsonRpcProvider = new ethers.providers.JsonRpcProvider("https://yolo-frosty-tab.zksync-mainnet.discover.quiknode.pro/2a18126698ac080279a34978bd9f053fbdffb55d/");
const wallet: ethers.Wallet = new ethers.Wallet(process.env.WALLET_PRIVATE_KEY);
const signer: ethers.Wallet = wallet.connect(provider);


/////// ABI's \\\\\\
const routerAbi: any = require('./abis/zkSync/mute/muteRouter.json');
const erc20Abi: any = require("./abis/common/erc20.json");
const wethAbi: any = require("./abis/common/weth.json");

/////// Addresses \\\\\\
const ROUTER_ADDRESS: string = "0x8B791913eB07C32779a16750e3868aA8495F5964";
const WETH_ADDRESS: string = '0x5AEa5775959fBC2557Cc8789bC1bf90A239D9a91';
const MUTE_ADDRESS: string = '0x0e97C7a0F8B2C9885C8ac9fC6136e829CbC21d42';
const USDC_ADDRESS: string = '0x3355df6D4c9C3035724Fd0e3914dE96A5a83aaf4';
const wMLP_POOL_ADDRESS: string = '0xb85feb6aF3412d690DFDA280b73EaED73a2315bC';

// /////// Contracts \\\\\\
const router: ethers.Contract = new ethers.Contract(ROUTER_ADDRESS, routerAbi, provider);
const usdc: ethers.Contract = new ethers.Contract(USDC_ADDRESS, erc20Abi, provider);
const mute: ethers.Contract = new ethers.Contract(MUTE_ADDRESS, erc20Abi, provider);
const weth: ethers.Contract = new ethers.Contract(WETH_ADDRESS, wethAbi, provider);
const wMlpPool: ethers.Contract = new ethers.Contract(wMLP_POOL_ADDRESS, erc20Abi, provider);

/////// Address book \\\\\\
const addressBook: { [key: string]: any } = {};
addressBook[ROUTER_ADDRESS] = router;
addressBook[USDC_ADDRESS] = usdc;
addressBook[MUTE_ADDRESS] = mute;
addressBook[WETH_ADDRESS] = weth;
addressBook[wMLP_POOL_ADDRESS] = wMlpPool;

//getTokeDecimal
async function getTokenDecimals(tokenAddress: string): Promise<number> {
  // Create an instance of the ERC20 contract
  const tokenContract = new Contract(tokenAddress, erc20Abi, provider);

  // Call the `decimals` function to get the decimal places
  const decimals = await tokenContract.decimals();

  // Convert the result to a number
  const decimalsNumber = parseInt(decimals.toString());

  return decimalsNumber;
}

function calculatePoolAddress(tokenA: string, tokenB: string): string {
  // Sort the token addresses lexicographically
  const sortedTokens = [tokenA, tokenB].sort();

  // Concatenate the sorted token addresses
  const concatenatedAddresses = sortedTokens[0] + sortedTokens[1];

  // Compute the hash of the concatenated addresses
  const poolAddressHash = keccak256(concatenatedAddresses);

  // Take the first 20 bytes of the pool address hash
  const poolAddress = poolAddressHash.slice(0, 20);

  return poolAddress;
}

/////// Log ETH, WETH, USDC and MUTE balances of the account \\\\\\
async function logBalances(): Promise<void> {
  try {
    const ethBalance: ethers.BigNumber = await provider.getBalance(signer.address);
    console.log('ETH Balance:', ethers.utils.formatEther(ethBalance));

    const wethDecimals: number = await getTokenDecimals(WETH_ADDRESS); // Retrieve decimal places for WETH
    const wethBalance: ethers.BigNumber = await weth.balanceOf(signer.address);
    console.log('WETH Balance:', ethers.utils.formatUnits(wethBalance, wethDecimals));

    const usdcDecimals: number = await getTokenDecimals(USDC_ADDRESS); // Retrieve decimal places for USDC
    const usdcBalance: ethers.BigNumber = await usdc.balanceOf(signer.address);
    console.log('USDC Balance:', ethers.utils.formatUnits(usdcBalance, usdcDecimals));

    const muteDecimals: number = await getTokenDecimals(MUTE_ADDRESS); // Retrieve decimal places for MUTE
    const muteBalance: ethers.BigNumber = await mute.balanceOf(signer.address);
    console.log('MUTE Balance:', ethers.utils.formatUnits(muteBalance, muteDecimals));

    const wMlpPoolDecimals: number = await getTokenDecimals(wMLP_POOL_ADDRESS); // Retrieve decimal places for wMLP
    const wMlpPoolBalance: ethers.BigNumber = await wMlpPool.balanceOf(signer.address);
    console.log('wMLP Balance:', ethers.utils.formatUnits(wMlpPoolBalance, wMlpPoolDecimals));

    console.log('--------------------');
  } catch (error) {
    console.error('Error logging balances:', error);
  }
}


/////// Do the swap function \\\\\\

async function swap(amount: string, tokenIn: string, tokenOut: string): Promise<void> {
  try {
    const decimalsIn: number = await getTokenDecimals(tokenIn);
    const decimalsOut: number = await getTokenDecimals(tokenOut);

    const amountIn: ethers.BigNumber = ethers.utils.parseUnits(amount, decimalsIn);
    const approve: ethers.ContractTransaction = await addressBook[tokenIn]
      .connect(signer)
      .estimateGas.approve(ROUTER_ADDRESS, amountIn)
      .then((gasLimit: ethers.BigNumber) => {
        return addressBook[tokenIn].connect(signer).approve(ROUTER_ADDRESS, amountIn, { gasLimit });
      });

    await approve.wait();

    const amounts: ethers.BigNumber[] = await router
      .connect(signer)
      .estimateGas.getAmountsOut(amountIn, [tokenIn, tokenOut])
      .then((gasLimit: ethers.BigNumber) => {
        return router.connect(signer).getAmountsOut(amountIn, [tokenIn, tokenOut], { gasLimit });
      });

    const amountOutMin: ethers.BigNumber = amounts[1].sub(amounts[1].div(10)); // 10% slippage tolerance

    const swap: ethers.ContractTransaction = await router
      .connect(signer)
      .estimateGas.swapExactTokensForTokens(
        amountIn,
        amountOutMin,
        [tokenIn, tokenOut],
        signer.address,
        ~~(Date.now() / 1000 + 60 * 10),
        [true, true]
      )
      .then((gasLimit: ethers.BigNumber) => {
        return router
          .connect(signer)
          .swapExactTokensForTokens(
            amountIn,
            amountOutMin,
            [tokenIn, tokenOut],
            signer.address,
            ~~(Date.now() / 1000 + 60 * 10),
            [true, true],
            { gasLimit }
          );
      });

    const swapReceipt: ethers.ContractReceipt = await swap.wait();
    console.log('Swap Transaction Value:', ethers.utils.formatEther(swapReceipt.value));
    console.log('Swap Gas Fee:', ethers.utils.formatEther(swapReceipt.gasUsed.mul(swapReceipt.gasPrice)));
  } catch (error) {
    console.error('Error swapping tokens:', error);
  }
}

  
  /////// Do the Add liquidity function \\\\\\

  async function addLiquidity(amountA: string, amountB: string, tokenA: string, tokenB: string): Promise<void> {
    try {
      const tokenADecimals = await getTokenDecimals(tokenA); // Retrieve decimal places for token A
      const tokenBDecimals = await getTokenDecimals(tokenB); // Retrieve decimal places for token B
  
      const amountInA: ethers.BigNumber = ethers.utils.parseUnits(amountA, tokenADecimals);
      const amountInB: ethers.BigNumber = ethers.utils.parseUnits(amountB, tokenBDecimals);
  
      const approveA: ethers.ContractTransaction = await addressBook[tokenA]
        .connect(signer)
        .estimateGas.approve(ROUTER_ADDRESS, amountInA)
        .then((gasLimit: ethers.BigNumber) => {
          return addressBook[tokenA].connect(signer).approve(ROUTER_ADDRESS, amountInA, { gasLimit });
        });
  
      const approveB: ethers.ContractTransaction = await addressBook[tokenB]
        .connect(signer)
        .estimateGas.approve(ROUTER_ADDRESS, amountInB)
        .then((gasLimit: ethers.BigNumber) => {
          return addressBook[tokenB].connect(signer).approve(ROUTER_ADDRESS, amountInB, { gasLimit });
        });
  
      await Promise.all([approveA.wait(), approveB.wait()]);
  
      const amounts: ethers.BigNumber[] = await router
        .connect(signer)
        .estimateGas.getAmountsOut(amountInA, [tokenA, tokenB])
        .then((gasLimit: ethers.BigNumber) => {
          return router.connect(signer).getAmountsOut(amountInA, [tokenA, tokenB], { gasLimit });
        });
  
      const amountOutB: ethers.BigNumber = amounts[1].mul(amountInA).div(amounts[0]);

      // The getAmountsOut function is called on the Router contract to get the expected output amounts based on the input amountInA and the desired token pair [tokenA, tokenB]. The amountOutB is calculated as a proportion of the expected output.
      // const amounts: ethers.BigNumber[] = await router.connect(signer).getAmountsOut(amountInA, [tokenA, tokenB]);
      const addLiquidity: ethers.ContractTransaction = await router
        .connect(signer)
        .estimateGas.addLiquidity(amountInA, amountOutB, signer.address, ~~(Date.now() / 1000 + 60 * 10))
        .then((gasLimit: ethers.BigNumber) => {
          return router
            .connect(signer)
            .addLiquidity(amountInA, amountOutB, signer.address, ~~(Date.now() / 1000 + 60 * 10), { gasLimit });
        });
  
      const addLiquidityReceipt: ethers.ContractReceipt = await addLiquidity.wait();
      console.log('Add Liquidity Transaction Value:', ethers.utils.formatEther(addLiquidityReceipt.value));
      console.log(
        'Add Liquidity Gas Fee:',
        ethers.utils.formatEther(addLiquidityReceipt.gasUsed.mul(addLiquidityReceipt.gasPrice))
      );
    } catch (error) {
      console.error('Error adding liquidity:', error);
    }
  }


  /////// Do the Remove liquidity function \\\\\\
  async function removeLiquidity(
    amountA: string,
    tokenA: string,
    tokenB: string,
    minAmountA: string,
    minAmountB: string
  ): Promise<void> {
    try {
      const tokenADecimals = await getTokenDecimals(tokenA); // Retrieve decimal places for token A
  
      const amountToRemoveA: string = ethers.utils.parseUnits(amountA, tokenADecimals).toString();
  
      // Calculate the pool address based on the token addresses
      const poolAddress = await calculatePoolAddress(tokenA, tokenB);
  
      // Retrieve the maximum balance in the liquidity pool
      const maximumBalance: BigNumber = await wMlpPool.balanceOf(poolAddress);
  
      // Ensure that the amount to be removed does not exceed the maximum balance
      const actualAmountToRemoveA: BigNumber = ethers.utils.parseUnits(amountToRemoveA, maximumBalance);
  
      const poolBalance: BigNumber = await wMlpPool.balanceOf(signer.address); // Retrieve current balance in the liquidity pool
  
      const approveA: ContractTransaction = await addressBook[tokenA].connect(signer).approve(ROUTER_ADDRESS, actualAmountToRemoveA);
      await approveA.wait();
  
      const approveB: ContractTransaction = await addressBook[tokenB].connect(signer).approve(ROUTER_ADDRESS, 0); // No need to approve tokenB as we're not removing it
      await approveB.wait();
  
      const removeLiquidity: ContractTransaction = await router.connect(signer).removeLiquidity(
        tokenA,
        tokenB,
        actualAmountToRemoveA,
        0, // Setting the amount of tokenB to 0 to remove only tokenA
        ethers.utils.parseUnits(minAmountA, tokenADecimals),
        ethers.utils.parseUnits(minAmountB, tokenADecimals),
        signer.getAddress,
        Math.floor(Date.now() / 1000 + 60 * 10)
      );
      const removeLiquidityReceipt: ContractReceipt = await removeLiquidity.wait();
  
      console.log('Remove Liquidity Transaction Value:', ethers.utils.formatEther(removeLiquidityReceipt.value));
      console.log('Remove Liquidity Gas Fee:', ethers.utils.formatEther(removeLiquidityReceipt.gasUsed.mul(removeLiquidityReceipt.gasPrice)));
  
      const remainingBalance: BigNumber = await wMlpPool.balanceOf(signer.address); // Retrieve remaining balance in the liquidity pool
      const removedBalance: BigNumber = poolBalance.sub(remainingBalance);
      console.log('Removed Liquidity Amount:', ethers.utils.formatEther(removedBalance));
    } catch (error) {
      console.error('Error removing liquidity:', error);
    }
  }


  async function main(): Promise<void> {
    try {
      await logBalances();
      // Perform your swap, add liquidity, or remove liquidity operations here
  
      // Example: Swap 1 ETH for MUTE
      await swap('1', WETH_ADDRESS, MUTE_ADDRESS);
  
      // Example: Add liquidity of 0.1 ETH and 100 USDC
      //In this example, the addLiquidity function will estimate the appropriate output amount of USDC based on the current conversion rate between ETH and USDC. It will then add the specified input amounts of ETH and USDC to the liquidity pool, ensuring the desired ratio between the two tokens.
      // By passing the desired input amounts of both tokens ('0.1' and '100'), we are instructing the function to add liquidity with those specific amounts while relying on the estimated conversion rate internally.
      await addLiquidity('0.1', '100', WETH_ADDRESS, USDC_ADDRESS);
      
      // Example: Remove liquidity of 0.1 wMLP and get ETH and USDC with minimum amounts of 0.01 ETH and 10 USDC
      await removeLiquidity('0.1', WETH_ADDRESS, USDC_ADDRESS, '0.01', '10');
  
      await logBalances();
    } catch (error) {
      console.error('Error in main function:', error);
    }
  }
  
  main();