import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { AuctionStartEventObject, DutchAuction } from '../typechain-types/DutchAuction';

function randomInt(from: number, to: number): number {
  return Math.floor(Math.random() * to + from);
}

async function createLot(
  dutchAuction: DutchAuction,
  account: SignerWithAddress,
  options?: {
    itemId?: number;
    period?: number;
    startPrice?: number;
    priceStep?: number;
  }
): Promise<AuctionStartEventObject> {
  const randomItemId = options?.itemId || randomInt(1, 100);
  const randomPeriod = options?.period || randomInt(60 * 60, 60 * 60 * 24);
  const randomStartPrice = options?.startPrice || randomInt(30_000, 50_000);
  const randomPriceStep = options?.priceStep || randomInt(500, 1000);

  const transaction = await dutchAuction.connect(account).sell(
    randomItemId,
    randomStartPrice,
    randomPriceStep,
    randomPeriod,
  ).then(t => t.wait());

  const auctionStartEvent = transaction.events?.find(({ event }) => event === 'AuctionStart');
  return auctionStartEvent!.args as unknown as AuctionStartEventObject;
}

describe('DutchAuction', function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployedContract(): Promise<{
    dutchAuction: DutchAuction,
    owner: SignerWithAddress,
    otherAccount: SignerWithAddress,
    oneMoreOtherAccount: SignerWithAddress,
  }> {
    const [owner, otherAccount, oneMoreOtherAccount]: SignerWithAddress[] = await ethers.getSigners();

    const DutchAuction = await ethers.getContractFactory('DutchAuction');
    const dutchAuction = await DutchAuction.connect(owner).deploy();

    return { dutchAuction, owner, otherAccount, oneMoreOtherAccount };
  }

  async function contractWithLot() {
    const { dutchAuction, owner, otherAccount, oneMoreOtherAccount } = await deployedContract();
    const { lot, lotId } = await createLot(dutchAuction, owner);
    return { dutchAuction, owner, otherAccount, lot, lotId, oneMoreOtherAccount };
  }

  describe('Deployment', function () {

    it('Should set the right owner', async function () {
      const { dutchAuction, owner } = await loadFixture(deployedContract);

      expect(await dutchAuction.owner()).to.equal(await owner.getAddress());
    });

  });

  describe('Sell', function () {
    it('Puts something to sell', async function () {
      const { dutchAuction, owner } = await loadFixture(deployedContract);

      const startPrice = randomInt(10_000, 100_000);
      const priceStep = randomInt(10_000, 100_000);
      const period = randomInt(10_000, 30_000);

      const transaction = await dutchAuction.sell(
        randomInt(1, 10),
        startPrice,
        priceStep,
        period,
      ).then(t => t.wait());

      const auctionStartEvent = transaction.events?.find(({ event }) => event === 'AuctionStart');
      expect(auctionStartEvent).is.not.empty;
      const { lot, lotId } = auctionStartEvent!.args as unknown as AuctionStartEventObject;
      expect(lot.seller).to.equal(await owner.getAddress());
      expect(lot.startPrice).to.equal(startPrice);
      expect(lot.priceStep).to.equal(priceStep);
      expect(lot.period).to.equal(period);
      expect(lot.startedAt).to.equal(await time.latest());
      expect(lotId).to.equal(1);

    });

    it('checks price time to time', async function () {
      const { dutchAuction, owner, lotId, lot } = await loadFixture(contractWithLot);
      const { startPrice, priceStep, period, startedAt } = lot;

      expect(await dutchAuction.getCurrentPrice(lotId)).to.equal(startPrice);
      await time.increase(period);
      expect(await dutchAuction.getCurrentPrice(lotId)).to.equal(startPrice.sub(priceStep));
      await time.increase(period.mul(3));
      expect(await dutchAuction.getCurrentPrice(lotId)).to.equal(startPrice.sub(priceStep.mul(4)));

      const endedTime = startedAt.add(startPrice.div(priceStep).add(1).mul(period));

      await time.increaseTo(endedTime);

      await expect(
        dutchAuction.getCurrentPrice(lotId),
      ).to.be.rejectedWith(/LotIsNotExisting/);
    });

  });


});
