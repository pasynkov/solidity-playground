import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import {
  AuctionStartEventObject,
  EnglishAuction, GoodShippedEventObject,
} from '../typechain-types/EnglishAuction';
import { Signer } from 'ethers';

function randomInt(from: number, to: number): number {
  return Math.floor(Math.random() * to + from);
}

async function createLot(
  englishAuction: EnglishAuction,
  account: Signer,
  options?: {
    goodId?: number;
    period?: number;
    startPrice?: number;
    priceStep?: number;
  }
): Promise<AuctionStartEventObject> {
  const randomGoodId = options?.goodId || randomInt(1, 100);
  const randomPeriod = options?.period || randomInt(100, 100_000);
  const randomStartPrice = options?.startPrice || randomInt(10, 100);
  const randomPriceStep = options?.priceStep || randomInt(1, 10);

  const transaction = await englishAuction.connect(account).sell(
    randomGoodId,
    randomPeriod,
    randomStartPrice,
    randomPriceStep,
  ).then(t => t.wait());

  const auctionStartEvent = transaction.events?.find(({ event }) => event === 'AuctionStart');
  return auctionStartEvent!.args as unknown as AuctionStartEventObject;
}

describe('EnglishAuction', function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployedContract(): Promise<{
    englishAuction: EnglishAuction,
    owner: Signer,
    otherAccount: Signer,
    oneMoreOtherAccount: Signer,
  }> {
    const [owner, otherAccount, oneMoreOtherAccount]: Signer[] = await ethers.getSigners();

    const EnglishAuction = await ethers.getContractFactory('EnglishAuction');
    const englishAuction = await EnglishAuction.connect(owner).deploy();

    return { englishAuction, owner, otherAccount, oneMoreOtherAccount };
  }

  async function contractWithLot() {
    const { englishAuction, owner, otherAccount, oneMoreOtherAccount } = await deployedContract();
    const { lot } = await createLot(englishAuction, owner);
    return { englishAuction, owner, otherAccount, lot, oneMoreOtherAccount };
  }

  describe('Deployment', function () {

    it('Should set the right owner', async function () {
      const { englishAuction, owner } = await loadFixture(deployedContract);

      expect(await englishAuction.owner()).to.equal(await owner.getAddress());
    });

  });

  describe('Sell', function () {
    it('Puts something to sell', async function () {
      const { englishAuction, owner } = await loadFixture(deployedContract);

      const randomGoodId = randomInt(1, 100);
      const randomPeriod = randomInt(100, 100_000);
      const randomPriceStep = randomInt(1, 10);
      const randomStartPrice = randomInt(10, 100);

      const transaction = await englishAuction.sell(
        randomGoodId,
        randomPeriod,
        randomStartPrice,
        randomPriceStep,
      ).then(t => t.wait());
      const auctionStartEvent = transaction.events?.find(({ event }) => event === 'AuctionStart');
      expect(auctionStartEvent).is.not.empty;
      const { lot, goodId, lotId } = auctionStartEvent!.args as unknown as AuctionStartEventObject;
      expect(lot.seller).to.equal(await owner.getAddress());
      expect(lot.priceStep).to.equal(randomPriceStep);
      expect(lot.startPrice).to.equal(randomStartPrice);
      expect(lotId).to.equal(1);
      expect(goodId).to.equal(randomGoodId);
      const timestamp = await time.latest();
      expect(lot.endTime).to.equal(timestamp + randomPeriod);
    });

  });

  describe('Buy', function () {

    it('Fails bid on non existing log', async function () {
      const { englishAuction, otherAccount } = await loadFixture(deployedContract);
      const lotId = 1;
      await expect(englishAuction.connect(otherAccount).makeBid(lotId).then(t => t.wait())).to.be.rejectedWith(/Lot is not existing/);
    });

    it('Fails bid on completed lot', async function () {
      const { englishAuction, otherAccount, owner } = await loadFixture(deployedContract);

      const period = 1_000_000;

      const lot = await createLot(englishAuction, owner, {
        period,
      });

      await time.increase(period);
      await expect(
        englishAuction.connect(otherAccount).makeBid(lot.lotId).then(t => t.wait()),
      ).to.be.rejectedWith(/Lot already completed/);

    });

    it('Fails without money', async function () {
      const { englishAuction, otherAccount, owner } = await loadFixture(deployedContract);

      const { lot } = await createLot(englishAuction, owner);

      await expect(
        englishAuction.connect(otherAccount).makeBid(lot.lotId).then(t => t.wait()),
      ).to.be.rejectedWith(/You must attach money/);

    });

    it('Fails when owner makes a bid', async function () {
      const { englishAuction, owner } = await loadFixture(deployedContract);

      const { lot } = await createLot(englishAuction, owner);

      await expect(
        englishAuction.connect(owner).makeBid(lot.lotId).then(t => t.wait()),
      ).to.be.rejectedWith(/Owner cannot make a bid/);

    });

    it('Fails bid with small price', async function () {
      const { englishAuction, otherAccount, owner } = await loadFixture(deployedContract);

      const { lot } = await createLot(englishAuction, owner);
      const { startPrice } = lot;
      const value = startPrice.sub(1);

      await expect(
        englishAuction.connect(otherAccount).makeBid(lot.lotId, { value }).then(t => t.wait()),
      ).to.be.rejectedWith(/Bid must be more than start price/);

    });

    it('Fails bid if bidder makes last bid', async function () {
      const { englishAuction, otherAccount, owner } = await loadFixture(deployedContract);

      const { lot } = await createLot(englishAuction, owner);
      const { startPrice, priceStep } = lot;
      const value = startPrice;

      await englishAuction.connect(otherAccount).makeBid(lot.lotId, { value }).then(t => t.wait());

      await expect(
        englishAuction.connect(otherAccount).makeBid(lot.lotId, { value: value.add(priceStep) }).then(t => t.wait()),
      ).to.be.rejectedWith(/You already make a bid/);

    });

    it('Fails bid with small price step', async function () {
      const {
        englishAuction,
        otherAccount,
        owner,
        oneMoreOtherAccount
      } = await loadFixture(deployedContract);

      const { lot } = await createLot(englishAuction, owner);
      const { priceStep, startPrice } = lot;
      let value = startPrice;

      await englishAuction.connect(otherAccount).makeBid(lot.lotId, { value }).then(t => t.wait());

      value = value.add(priceStep).sub(1);

      await expect(
        englishAuction.connect(oneMoreOtherAccount).makeBid(lot.lotId, { value }).then(t => t.wait())
      ).to.be.rejectedWith(/Bid must be more by priceStep from last bid/);

    });

    it('Returns first bid after makes a second', async function () {
      const { englishAuction, otherAccount, lot, oneMoreOtherAccount } = await loadFixture(contractWithLot);
      const { startPrice, priceStep } = lot;

      const startBalance = await otherAccount.getBalance();

      const firstBidTransaction = await englishAuction.connect(otherAccount).makeBid(lot.lotId, { value: startPrice }).then(t => t.wait());

      const balanceAfterBid = await otherAccount.getBalance();

      const firstBidGasSpend = firstBidTransaction.gasUsed.mul(firstBidTransaction.effectiveGasPrice);

      expect(startBalance.sub(balanceAfterBid).sub(firstBidGasSpend)).to.equal(startPrice);

      await englishAuction.connect(oneMoreOtherAccount).makeBid(lot.lotId, { value: startPrice.add(priceStep) }).then(t => t.wait());

      const balanceAfterSecondBid = await otherAccount.getBalance();

      expect(balanceAfterSecondBid.sub(startPrice)).to.equal(balanceAfterBid);

    });
  });

  describe('Closes actions', async function() {

    it('Sends money to seller after claim', async function() {
      const { englishAuction, otherAccount, owner, lot, oneMoreOtherAccount } = await loadFixture(contractWithLot);
      const { startPrice, priceStep, endTime } = lot;
      await englishAuction.connect(otherAccount).makeBid(lot.lotId, { value: startPrice }).then(t => t.wait());
      await englishAuction.connect(oneMoreOtherAccount).makeBid(lot.lotId, { value: startPrice.add(priceStep) }).then(t => t.wait());

      await expect(
        englishAuction.connect(owner).claim(lot.lotId).then(t => t.wait())
      ).to.be.rejectedWith(/Lot is still receiving bids/);

      await time.increaseTo(endTime);

      const ownerBalance = await owner.getBalance();
      const { events, gasUsed, effectiveGasPrice} = await englishAuction.connect(owner).claim(lot.lotId).then(t => t.wait());

      const goodShippedEvent = events?.find(e => e.event === 'GoodShipped');
      expect(goodShippedEvent).is.not.empty;
      const { from, to, goodId } = goodShippedEvent!.args as unknown as GoodShippedEventObject;
      expect(from).to.equal(await owner.getAddress());
      expect(to).to.equal(await oneMoreOtherAccount.getAddress());
      expect(goodId).to.equal(lot.goodId);

      const claimGasSpend = gasUsed.mul(effectiveGasPrice);
      const balanceAfterClaim = await owner.getBalance();

      expect(balanceAfterClaim).to.equal(ownerBalance.add(startPrice.add(priceStep)).sub(claimGasSpend));

      expect(await englishAuction.provider.getBalance(englishAuction.address)).to.equal(0);

    });

    it('Cancels auction by seller', async function() {
      const { englishAuction, owner, otherAccount, lot } = await loadFixture(contractWithLot);
      const { startPrice } = lot;
      await expect(
        englishAuction.connect(otherAccount).cancel(lot.lotId).then(t => t.wait())
      ).to.be.rejectedWith(/Only owner can close lot/);

      await englishAuction.connect(otherAccount).makeBid(lot.lotId, { value: startPrice }).then(t => t.wait());

      const otherAccountBalance = await otherAccount.getBalance();
      const { events } = await englishAuction.connect(owner).cancel(lot.lotId).then(t => t.wait());
      const goodShippedEvent = events?.find(e => e.event === 'GoodShipped');
      expect(goodShippedEvent).is.not.empty;
      const { from, to, goodId } = goodShippedEvent!.args as unknown as GoodShippedEventObject;
      expect(from).to.equal(await owner.getAddress());
      expect(to).to.equal(await owner.getAddress());
      expect(goodId).to.equal(lot.goodId);
      const otherAccountBalanceAfterCancel = await otherAccount.getBalance();

      expect(otherAccountBalanceAfterCancel).to.equal(otherAccountBalance.add(startPrice));

    });



  });

});
