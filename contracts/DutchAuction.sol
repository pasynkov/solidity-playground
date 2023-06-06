pragma solidity ^0.8.9;

import "hardhat/console.sol";

contract DutchAuction {

    address payable public owner;

    struct Lot {
        address seller;
        uint itemId;
        uint256 startPrice;
        uint256 priceStep;
        uint period;
        uint startedAt;
        uint endAt;
    }

    mapping(uint256 => Lot) public lots;
    uint private lastLotId = 0;

    modifier lotIsActive(uint256 lotId) {
        if(lots[lotId].itemId == 0) {
            revert LotIsNotExisting(lotId);
        }

        if (block.timestamp > lots[lotId].endAt) {
            revert LotIsNotExisting(lotId);
        }

        _;
    }

    error LotIsNotExisting(uint256 lotId);

    event AuctionStart(
        address indexed seller,
        uint256 indexed lotId,
        Lot lot
    );

    constructor() {
        owner = payable(msg.sender);
    }

    function sell(
        uint itemId,
        uint256 startPrice,
        uint256 priceStep,
        uint256 period
    ) public {

        Lot memory lot = Lot(
            msg.sender,
            itemId,
            startPrice,
            priceStep,
            period,
            block.timestamp,
            block.timestamp + (startPrice / priceStep * period)
        );

        lots[++lastLotId] = lot;

        emit AuctionStart(msg.sender, lastLotId, lot);
    }

    function getCurrentPrice(
        uint256 lotId
    ) public view
    lotIsActive(lotId)
    returns(uint256) {

        uint priceReducer = getPriceReducer(
            block.timestamp,
            lots[lotId].startedAt,
            lots[lotId].period,
            lots[lotId].priceStep
        );

        if (priceReducer == 0) {
            return lots[lotId].startPrice;
        }
        return lots[lotId].startPrice - priceReducer;
    }

    function getPriceReducer(
        uint now_,
        uint startedAt,
        uint period,
        uint priceStep
    ) private pure returns(uint){
        uint spendTime = now_ - startedAt;
        uint periods = spendTime / period;
        return periods * priceStep;
    }

}
