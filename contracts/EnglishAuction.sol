// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "hardhat/console.sol";

contract EnglishAuction {

    address payable public owner;

    struct Lot {
        uint256 lotId;
        uint256 goodId;
        address seller;
        uint endTime;
        uint startPrice;
        uint priceStep;
    }

    struct Bid {
        uint256 lotId;
        address bidder;
        uint256 amount;
        uint timestamp;
    }

    mapping(uint256 => Lot) public lots;
    mapping(uint256 => Bid[]) public bids;

    uint256 private lastLotId = 0;

    modifier lotIsActive(uint256 lotId) {
        require(lots[lotId].goodId != 0, "Lot is not existing");
        require(lots[lotId].endTime > block.timestamp, "Lot already completed");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can do it");
        _;
    }

    event AuctionStart(
        address payable indexed seller,
        uint256 indexed lotId,
        uint256 indexed goodId,
        Lot lot
    );

    event BidAdded(
        address payable indexed bidder,
        uint256 indexed lotId,
        uint256 amount
    );

    event BidReturned(
        address payable indexed bidder,
        uint256 indexed lotId,
        uint256 amount
    );

    event AuctionCompleted(
        address payable indexed seller,
        uint256 indexed lotId,
        uint256 indexed goodId,
        uint256 amount,
        Lot lot
    );

    event GoodShipped(
        address payable indexed from,
        address payable indexed to,
        uint256 indexed goodId
    );

    error CannotBid(string info);
    error CannotCloseLot(string info);

    constructor() {
        owner = payable(msg.sender);
    }

    function sell(
        uint256 goodId,
        uint period,
        uint startPrice,
        uint priceStep
    ) public returns(bool) {
        uint256 lotId = ++lastLotId;
        lots[lotId] = Lot(
            lotId,
            goodId,
            payable(msg.sender),
            uint(period + block.timestamp),
            startPrice,
            priceStep
        );
        emit AuctionStart(payable(msg.sender), lotId, goodId, lots[lotId]);
        return true;
    }

    function makeBid(
        uint256 lotId
    ) public payable
        lotIsActive(lotId)
        returns(bool) {

        Lot memory lot = lots[lotId];

        if (msg.sender == lot.seller) {
            revert CannotBid("Owner cannot make a bid");
        }

        if (msg.value == 0) {
            revert CannotBid("You must attach money");
        }


        if (msg.value < lot.startPrice) {
            revert CannotBid("Bid must be more than start price");
        }

        uint256 minimalAmount = lot.startPrice;
        Bid memory lastBid;

        if (bids[lotId].length > 0) {
            lastBid = bids[lotId][bids[lotId].length - 1];

            if (msg.sender == lastBid.bidder) {
                revert CannotBid("You already make a bid");
            }

            minimalAmount = lastBid.amount + lot.priceStep;
        }

        if (msg.value < minimalAmount) {
            revert CannotBid("Bid must be more by priceStep from last bid");
        }

        if (lastBid.amount > 0) {
            emit BidReturned(payable(lastBid.bidder), lastBid.lotId, lastBid.amount);
            payable(lastBid.bidder).transfer(lastBid.amount);
        }

        Bid memory bid = Bid(
            lotId,
            payable(msg.sender),
            msg.value,
            block.timestamp
        );
        bids[lotId].push(bid);
        emit BidAdded(payable(bid.bidder), bid.lotId, bid.amount);
        return true;
    }

    function claim(
        uint256 lotId
    ) public returns(bool) {
        Lot memory lot = lots[lotId];
        if (lot.lotId == 0) {
            revert CannotCloseLot('Lot not exists');
        }

        if (lot.endTime > block.timestamp) {
            revert CannotCloseLot('Lot is still receiving bids');
        }

        Bid memory lastBid;

        if (bids[lotId].length > 0) {
            lastBid = bids[lotId][bids[lotId].length - 1];
            payable(lot.seller).transfer(lastBid.amount);
        }

        sendGood(lot.goodId, payable(lot.seller), lastBid.amount > 0 ? payable(lastBid.bidder) : payable(lot.seller));

        emit AuctionCompleted(payable(lot.seller), lotId, lot.goodId, lastBid.amount, lot);
        return true;
    }

    function cancel(
        uint256 lotId
    ) public
    lotIsActive(lotId)
    returns(bool) {
        Lot memory lot = lots[lotId];
        if (lot.seller != msg.sender) {
            revert CannotCloseLot('Only owner can close lot');
        }

        Bid memory lastBid;

        if (bids[lotId].length > 0) {
            lastBid = bids[lotId][bids[lotId].length - 1];
            payable(lastBid.bidder).transfer(lastBid.amount);
        }

        sendGood(lot.goodId, payable(lot.seller), payable(lot.seller));

        emit AuctionCompleted(payable(lot.seller), lotId, lot.goodId, 0, lot);
        return true;
    }

    function sendGood(
        uint256 goodId,
        address payable from,
        address payable to
    ) private returns(bool) {
        emit GoodShipped(payable(from), payable(to), goodId);
        return true;
    }


}
