import * as p from '@subsquid/evm-codec'
import { event, fun, viewFun, indexed, ContractBase } from '@subsquid/evm-abi'
import type { EventParams as EParams, FunctionArguments, FunctionReturn } from '@subsquid/evm-abi'

export const events = {
    ApprovalForAll: event("0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c31", "ApprovalForAll(address,address,bool)", {"account": indexed(p.address), "operator": indexed(p.address), "approved": p.bool}),
    ArticleEvaluated: event("0xa47847c5419013bc5fa344eaa882ed5b33f76d87a7ce6a1a760d5af198afd9e5", "ArticleEvaluated(uint256,address,uint8,uint256,uint256)", {"articleId": indexed(p.uint256), "user": indexed(p.address), "score": p.uint8, "amountPaid": p.uint256, "timestamp": p.uint256}),
    ArticlePublished: event("0x596e3673799552097ea0bc75b818086e7a7c177b54ff630efd544c511681d6b1", "ArticlePublished(uint256,address,uint256,string,string,string,uint256,address,uint256,uint256,uint8)", {"articleId": indexed(p.uint256), "author": indexed(p.address), "categoryId": indexed(p.uint256), "arweaveId": p.string, "originalAuthor": p.string, "title": p.string, "timestamp": p.uint256, "trueAuthor": p.address, "collectPrice": p.uint256, "maxCollectSupply": p.uint256, "originality": p.uint8}),
    ArticleCollected: event("0x24b54eb81304dfe4e560e2b09d1b8651d3de8efdf8fde769f1dbac6e690d81b5", "ArticleCollected(uint256,address,uint256,uint256,uint256)", {"articleId": indexed(p.uint256), "collector": indexed(p.address), "amount": p.uint256, "tokenId": p.uint256, "timestamp": p.uint256}),
    CommentAdded: event("0x19a5aae49af5681d63d1a8c6ea9dc7b88af86e08d71ade984e2087fada0d4c4a", "CommentAdded(uint256,address,string,uint256,uint8)", {"articleId": indexed(p.uint256), "commenter": indexed(p.address), "content": p.string, "parentCommentId": p.uint256, "score": p.uint8}),
    CommentLiked: event("0x3e2236223f9ef11dd92492a8d35ef88d2ef5bea632e11697c2565e8a55d2b401", "CommentLiked(uint256,uint256,address,address,uint256,uint256)", {"articleId": indexed(p.uint256), "commentId": indexed(p.uint256), "liker": indexed(p.address), "commenter": p.address, "amountPaid": p.uint256, "timestamp": p.uint256}),
    EIP712DomainChanged: event("0x0a6387c9ea3628b88a633bb4f3b151770f70085117a15f9bf3787cda53f13d31", "EIP712DomainChanged()", {}),
    FollowStatusChanged: event("0x75a1fc5e2239f53dc8407b3712c878c5893431bc3c349ea3561584869670f7f2", "FollowStatusChanged(address,address,bool)", {"follower": indexed(p.address), "target": indexed(p.address), "isFollowing": p.bool}),
    Initialized: event("0xc7f505b2f371ae2175ee4913f4499e1f2633a7b5936321eed1cdaeb6115181d2", "Initialized(uint64)", {"version": p.uint64}),
    MinActionValueUpdated: event("0xfcae2461302da2a86e3604d10afc558dc160d49eb88bc010c4bca093793857ff", "MinActionValueUpdated(uint256)", {"newValue": p.uint256}),
    Paused: event("0x62e78cea01bee320cd4e420270b5ea74000d11b0c9f74754ebdbfc544b05a258", "Paused(address)", {"account": p.address}),
    PlatformFeeUpdated: event("0x7cb8fa1ce2fc1ff6556e563c0dcba551db7cdeb3f3b0911243692639ac80e94d", "PlatformFeeUpdated(uint96)", {"newFeeBps": p.uint96}),
    ReferralPaid: event("0x6292f4f27d8047af4537a4bd86906de0e2c880c20086f7f58b81eacfeb639126", "ReferralPaid(address,uint256)", {"referrer": indexed(p.address), "amount": p.uint256}),
    RoleAdminChanged: event("0xbd79b86ffe0ab8e8776151514217cd7cacd52c909f66475c3af44e129f0b00ff", "RoleAdminChanged(bytes32,bytes32,bytes32)", {"role": indexed(p.bytes32), "previousAdminRole": indexed(p.bytes32), "newAdminRole": indexed(p.bytes32)}),
    RoleGranted: event("0x2f8788117e7eff1d82e926ec794901d17c78024a50270940304540a733656f0d", "RoleGranted(bytes32,address,address)", {"role": indexed(p.bytes32), "account": indexed(p.address), "sender": indexed(p.address)}),
    RoleRevoked: event("0xf6391f5c32d9c69d2a47ea670b442974b53935d1edc7fd64eb21e047a839171b", "RoleRevoked(bytes32,address,address)", {"role": indexed(p.bytes32), "account": indexed(p.address), "sender": indexed(p.address)}),
    SessionKeyManagerUpdated: event("0x4d57218e59793e6845c36a961c3af7acfce8c54b13a697da231466fc265fdb61", "SessionKeyManagerUpdated(address)", {"newManager": indexed(p.address)}),
    SessionKeyOperationExecuted: event("0xe915025b6f599b245c9c1c02d463228c896354d64dceb469760c99544153be6d", "SessionKeyOperationExecuted(address,address,bytes4)", {"owner": indexed(p.address), "sessionKey": indexed(p.address), "selector": p.bytes4}),
    TransferBatch: event("0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb", "TransferBatch(address,address,address,uint256[],uint256[])", {"operator": indexed(p.address), "from": indexed(p.address), "to": indexed(p.address), "ids": p.array(p.uint256), "values": p.array(p.uint256)}),
    TransferSingle: event("0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62", "TransferSingle(address,address,address,uint256,uint256)", {"operator": indexed(p.address), "from": indexed(p.address), "to": indexed(p.address), "id": p.uint256, "value": p.uint256}),
    TreasuryUpdated: event("0x7dae230f18360d76a040c81f050aa14eb9d6dc7901b20fc5d855e2a20fe814d1", "TreasuryUpdated(address)", {"newTreasury": p.address}),
    URI: event("0x6bb7ff708619ba0610cba295a58592e0451dee2622938c8755667688daf3529b", "URI(string,uint256)", {"value": p.string, "id": indexed(p.uint256)}),
    Unpaused: event("0x5db9ee0a495bf2e6ff9c91a7834c1ba4fdd244a5e8aa4e537bd38aeae4b073aa", "Unpaused(address)", {"account": p.address}),
    Upgraded: event("0xbc7cd75a20ee27fd9adebab32041f755214dbc6bffa90cc0225b39da2e5c2d3b", "Upgraded(address)", {"implementation": indexed(p.address)}),
}

export const functions = {
    DEFAULT_ADMIN_ROLE: viewFun("0xa217fddf", "DEFAULT_ADMIN_ROLE()", {}, p.bytes32),
    MAX_COMMENT_LENGTH: viewFun("0x5856e4fa", "MAX_COMMENT_LENGTH()", {}, p.uint256),
    MAX_ORIGINAL_AUTHOR_LENGTH: viewFun("0x19e94a6e", "MAX_ORIGINAL_AUTHOR_LENGTH()", {}, p.uint256),
    MAX_TITLE_LENGTH: viewFun("0x2ef9a160", "MAX_TITLE_LENGTH()", {}, p.uint256),
    PAUSER_ROLE: viewFun("0xe63ab1e9", "PAUSER_ROLE()", {}, p.bytes32),
    SCORE_DISLIKE: viewFun("0xfde84719", "SCORE_DISLIKE()", {}, p.uint8),
    SCORE_LIKE: viewFun("0xe1d90b34", "SCORE_LIKE()", {}, p.uint8),
    SCORE_NEUTRAL: viewFun("0x473106b2", "SCORE_NEUTRAL()", {}, p.uint8),
    UPGRADER_ROLE: viewFun("0xf72c0d8b", "UPGRADER_ROLE()", {}, p.bytes32),
    UPGRADE_INTERFACE_VERSION: viewFun("0xad3cb1cc", "UPGRADE_INTERFACE_VERSION()", {}, p.string),
    articles: viewFun("0xedcfafe6", "articles(uint256)", {"_0": p.uint256}, {"author": p.address, "timestamp": p.uint64, "categoryId": p.uint16, "maxCollectSupply": p.uint32, "collectCount": p.uint32, "originality": p.uint8, "collectPrice": p.uint96, "arweaveHash": p.string}),
    balanceOf: viewFun("0x00fdd58e", "balanceOf(address,uint256)", {"account": p.address, "id": p.uint256}, p.uint256),
    balanceOfBatch: viewFun("0x4e1273f4", "balanceOfBatch(address[],uint256[])", {"accounts": p.array(p.address), "ids": p.array(p.uint256)}, p.array(p.uint256)),
    eip712Domain: viewFun("0x84b0196e", "eip712Domain()", {}, {"fields": p.bytes1, "name": p.string, "version": p.string, "chainId": p.uint256, "verifyingContract": p.address, "salt": p.bytes32, "extensions": p.array(p.uint256)}),
    evaluate: fun("0xff1f090a", "evaluate(uint256,uint8,string,address,uint256)", {"_articleId": p.uint256, "_score": p.uint8, "_content": p.string, "_referrer": p.address, "_parentCommentId": p.uint256}, ),
    evaluateWithSessionKey: fun("0x63c4ea4d", "evaluateWithSessionKey(address,address,uint256,uint8,string,address,uint256,uint256,bytes)", {"owner": p.address, "sessionKey": p.address, "_articleId": p.uint256, "_score": p.uint8, "_content": p.string, "_referrer": p.address, "_parentCommentId": p.uint256, "deadline": p.uint256, "signature": p.bytes}, ),
    follow: fun("0x63c3cc16", "follow(address,bool)", {"_target": p.address, "_status": p.bool}, ),
    followWithSessionKey: fun("0x5780400b", "followWithSessionKey(address,address,address,bool,uint256,bytes)", {"owner": p.address, "sessionKey": p.address, "_target": p.address, "_status": p.bool, "deadline": p.uint256, "signature": p.bytes}, ),
    getRoleAdmin: viewFun("0x248a9ca3", "getRoleAdmin(bytes32)", {"role": p.bytes32}, p.bytes32),
    grantRole: fun("0x2f2ff15d", "grantRole(bytes32,address)", {"role": p.bytes32, "account": p.address}, ),
    hasRole: viewFun("0x91d14854", "hasRole(bytes32,address)", {"role": p.bytes32, "account": p.address}, p.bool),
    initialize: fun("0x485cc955", "initialize(address,address)", {"_initialOwner": p.address, "_treasury": p.address}, ),
    isApprovedForAll: viewFun("0xe985e9c5", "isApprovedForAll(address,address)", {"account": p.address, "operator": p.address}, p.bool),
    likeComment: fun("0xdffd40f2", "likeComment(uint256,uint256,address,address)", {"_articleId": p.uint256, "_commentId": p.uint256, "_commenter": p.address, "_referrer": p.address}, ),
    likeCommentWithSessionKey: fun("0x79c61f28", "likeCommentWithSessionKey(address,address,uint256,uint256,address,address,uint256,bytes)", {"owner": p.address, "sessionKey": p.address, "_articleId": p.uint256, "_commentId": p.uint256, "_commenter": p.address, "_referrer": p.address, "deadline": p.uint256, "signature": p.bytes}, ),
    minActionValue: viewFun("0x8cbd215e", "minActionValue()", {}, p.uint256),
    multicall: fun("0xac9650d8", "multicall(bytes[])", {"data": p.array(p.bytes)}, p.array(p.bytes)),
    nextArticleId: viewFun("0x85c3ab54", "nextArticleId()", {}, p.uint256),
    pause: fun("0x8456cb59", "pause()", {}, ),
    paused: viewFun("0x5c975abb", "paused()", {}, p.bool),
    platformFeeBps: viewFun("0x22dcd13e", "platformFeeBps()", {}, p.uint96),
    platformTreasury: viewFun("0xe138818c", "platformTreasury()", {}, p.address),
    proxiableUUID: viewFun("0x52d1902d", "proxiableUUID()", {}, p.bytes32),
    publish: fun("0xc7e76bf0", "publish(string,uint64,uint96,string,string,address,uint256,uint256,uint8)", {"_arweaveId": p.string, "_categoryId": p.uint64, "_royaltyBps": p.uint96, "_originalAuthor": p.string, "_title": p.string, "_trueAuthor": p.address, "_collectPrice": p.uint256, "_maxCollectSupply": p.uint256, "_originality": p.uint8}, p.uint256),
    publishWithSessionKey: fun("0x944423f9", "publishWithSessionKey(address,address,(string,uint64,uint96,string,string,address,uint256,uint256,uint8),uint256,bytes)", {"owner": p.address, "sessionKey": p.address, "params": p.struct({"arweaveId": p.string, "categoryId": p.uint64, "royaltyBps": p.uint96, "originalAuthor": p.string, "title": p.string, "trueAuthor": p.address, "collectPrice": p.uint256, "maxCollectSupply": p.uint256, "originality": p.uint8}), "deadline": p.uint256, "signature": p.bytes}, p.uint256),
    renounceRole: fun("0x36568abe", "renounceRole(bytes32,address)", {"role": p.bytes32, "callerConfirmation": p.address}, ),
    revokeRole: fun("0xd547741f", "revokeRole(bytes32,address)", {"role": p.bytes32, "account": p.address}, ),
    royaltyInfo: viewFun("0x2a55205a", "royaltyInfo(uint256,uint256)", {"tokenId": p.uint256, "salePrice": p.uint256}, {"receiver": p.address, "amount": p.uint256}),
    safeBatchTransferFrom: fun("0x2eb2c2d6", "safeBatchTransferFrom(address,address,uint256[],uint256[],bytes)", {"from": p.address, "to": p.address, "ids": p.array(p.uint256), "values": p.array(p.uint256), "data": p.bytes}, ),
    safeTransferFrom: fun("0xf242432a", "safeTransferFrom(address,address,uint256,uint256,bytes)", {"from": p.address, "to": p.address, "id": p.uint256, "value": p.uint256, "data": p.bytes}, ),
    sessionKeyManager: viewFun("0x0b826190", "sessionKeyManager()", {}, p.address),
    setApprovalForAll: fun("0xa22cb465", "setApprovalForAll(address,bool)", {"operator": p.address, "approved": p.bool}, ),
    setMinActionValue: fun("0x52cbd3be", "setMinActionValue(uint256)", {"_minActionValue": p.uint256}, ),
    setPlatformFee: fun("0xf99e5dbb", "setPlatformFee(uint96)", {"_feeBps": p.uint96}, ),
    setPlatformTreasury: fun("0x7cd86d60", "setPlatformTreasury(address)", {"_treasury": p.address}, ),
    setSessionKeyManager: fun("0x837fa3fd", "setSessionKeyManager(address)", {"_sessionKeyManager": p.address}, ),
    supportsInterface: viewFun("0x01ffc9a7", "supportsInterface(bytes4)", {"interfaceId": p.bytes4}, p.bool),
    unpause: fun("0x3f4ba83a", "unpause()", {}, ),
    upgradeToAndCall: fun("0x4f1ef286", "upgradeToAndCall(address,bytes)", {"newImplementation": p.address, "data": p.bytes}, ),
    uri: viewFun("0x0e89341c", "uri(uint256)", {"_id": p.uint256}, p.string),
}

export class Contract extends ContractBase {

    DEFAULT_ADMIN_ROLE() {
        return this.eth_call(functions.DEFAULT_ADMIN_ROLE, {})
    }

    MAX_COMMENT_LENGTH() {
        return this.eth_call(functions.MAX_COMMENT_LENGTH, {})
    }

    MAX_ORIGINAL_AUTHOR_LENGTH() {
        return this.eth_call(functions.MAX_ORIGINAL_AUTHOR_LENGTH, {})
    }

    MAX_TITLE_LENGTH() {
        return this.eth_call(functions.MAX_TITLE_LENGTH, {})
    }

    PAUSER_ROLE() {
        return this.eth_call(functions.PAUSER_ROLE, {})
    }

    SCORE_DISLIKE() {
        return this.eth_call(functions.SCORE_DISLIKE, {})
    }

    SCORE_LIKE() {
        return this.eth_call(functions.SCORE_LIKE, {})
    }

    SCORE_NEUTRAL() {
        return this.eth_call(functions.SCORE_NEUTRAL, {})
    }

    UPGRADER_ROLE() {
        return this.eth_call(functions.UPGRADER_ROLE, {})
    }

    UPGRADE_INTERFACE_VERSION() {
        return this.eth_call(functions.UPGRADE_INTERFACE_VERSION, {})
    }

    articles(_0: ArticlesParams["_0"]) {
        return this.eth_call(functions.articles, {_0})
    }

    balanceOf(account: BalanceOfParams["account"], id: BalanceOfParams["id"]) {
        return this.eth_call(functions.balanceOf, {account, id})
    }

    balanceOfBatch(accounts: BalanceOfBatchParams["accounts"], ids: BalanceOfBatchParams["ids"]) {
        return this.eth_call(functions.balanceOfBatch, {accounts, ids})
    }

    eip712Domain() {
        return this.eth_call(functions.eip712Domain, {})
    }

    getRoleAdmin(role: GetRoleAdminParams["role"]) {
        return this.eth_call(functions.getRoleAdmin, {role})
    }

    hasRole(role: HasRoleParams["role"], account: HasRoleParams["account"]) {
        return this.eth_call(functions.hasRole, {role, account})
    }

    isApprovedForAll(account: IsApprovedForAllParams["account"], operator: IsApprovedForAllParams["operator"]) {
        return this.eth_call(functions.isApprovedForAll, {account, operator})
    }

    minActionValue() {
        return this.eth_call(functions.minActionValue, {})
    }

    nextArticleId() {
        return this.eth_call(functions.nextArticleId, {})
    }

    paused() {
        return this.eth_call(functions.paused, {})
    }

    platformFeeBps() {
        return this.eth_call(functions.platformFeeBps, {})
    }

    platformTreasury() {
        return this.eth_call(functions.platformTreasury, {})
    }

    proxiableUUID() {
        return this.eth_call(functions.proxiableUUID, {})
    }

    royaltyInfo(tokenId: RoyaltyInfoParams["tokenId"], salePrice: RoyaltyInfoParams["salePrice"]) {
        return this.eth_call(functions.royaltyInfo, {tokenId, salePrice})
    }

    sessionKeyManager() {
        return this.eth_call(functions.sessionKeyManager, {})
    }

    supportsInterface(interfaceId: SupportsInterfaceParams["interfaceId"]) {
        return this.eth_call(functions.supportsInterface, {interfaceId})
    }

    uri(_id: UriParams["_id"]) {
        return this.eth_call(functions.uri, {_id})
    }
}

/// Event types
export type ApprovalForAllEventArgs = EParams<typeof events.ApprovalForAll>
export type ArticleEvaluatedEventArgs = EParams<typeof events.ArticleEvaluated>
export type ArticlePublishedEventArgs = EParams<typeof events.ArticlePublished>
export type ArticleCollectedEventArgs = EParams<typeof events.ArticleCollected>
export type CommentAddedEventArgs = EParams<typeof events.CommentAdded>
export type CommentLikedEventArgs = EParams<typeof events.CommentLiked>
export type EIP712DomainChangedEventArgs = EParams<typeof events.EIP712DomainChanged>
export type FollowStatusChangedEventArgs = EParams<typeof events.FollowStatusChanged>
export type InitializedEventArgs = EParams<typeof events.Initialized>
export type MinActionValueUpdatedEventArgs = EParams<typeof events.MinActionValueUpdated>
export type PausedEventArgs = EParams<typeof events.Paused>
export type PlatformFeeUpdatedEventArgs = EParams<typeof events.PlatformFeeUpdated>
export type ReferralPaidEventArgs = EParams<typeof events.ReferralPaid>
export type RoleAdminChangedEventArgs = EParams<typeof events.RoleAdminChanged>
export type RoleGrantedEventArgs = EParams<typeof events.RoleGranted>
export type RoleRevokedEventArgs = EParams<typeof events.RoleRevoked>
export type SessionKeyManagerUpdatedEventArgs = EParams<typeof events.SessionKeyManagerUpdated>
export type SessionKeyOperationExecutedEventArgs = EParams<typeof events.SessionKeyOperationExecuted>
export type TransferBatchEventArgs = EParams<typeof events.TransferBatch>
export type TransferSingleEventArgs = EParams<typeof events.TransferSingle>
export type TreasuryUpdatedEventArgs = EParams<typeof events.TreasuryUpdated>
export type URIEventArgs = EParams<typeof events.URI>
export type UnpausedEventArgs = EParams<typeof events.Unpaused>
export type UpgradedEventArgs = EParams<typeof events.Upgraded>

/// Function types
export type DEFAULT_ADMIN_ROLEParams = FunctionArguments<typeof functions.DEFAULT_ADMIN_ROLE>
export type DEFAULT_ADMIN_ROLEReturn = FunctionReturn<typeof functions.DEFAULT_ADMIN_ROLE>

export type MAX_COMMENT_LENGTHParams = FunctionArguments<typeof functions.MAX_COMMENT_LENGTH>
export type MAX_COMMENT_LENGTHReturn = FunctionReturn<typeof functions.MAX_COMMENT_LENGTH>

export type MAX_ORIGINAL_AUTHOR_LENGTHParams = FunctionArguments<typeof functions.MAX_ORIGINAL_AUTHOR_LENGTH>
export type MAX_ORIGINAL_AUTHOR_LENGTHReturn = FunctionReturn<typeof functions.MAX_ORIGINAL_AUTHOR_LENGTH>

export type MAX_TITLE_LENGTHParams = FunctionArguments<typeof functions.MAX_TITLE_LENGTH>
export type MAX_TITLE_LENGTHReturn = FunctionReturn<typeof functions.MAX_TITLE_LENGTH>

export type PAUSER_ROLEParams = FunctionArguments<typeof functions.PAUSER_ROLE>
export type PAUSER_ROLEReturn = FunctionReturn<typeof functions.PAUSER_ROLE>

export type SCORE_DISLIKEParams = FunctionArguments<typeof functions.SCORE_DISLIKE>
export type SCORE_DISLIKEReturn = FunctionReturn<typeof functions.SCORE_DISLIKE>

export type SCORE_LIKEParams = FunctionArguments<typeof functions.SCORE_LIKE>
export type SCORE_LIKEReturn = FunctionReturn<typeof functions.SCORE_LIKE>

export type SCORE_NEUTRALParams = FunctionArguments<typeof functions.SCORE_NEUTRAL>
export type SCORE_NEUTRALReturn = FunctionReturn<typeof functions.SCORE_NEUTRAL>

export type UPGRADER_ROLEParams = FunctionArguments<typeof functions.UPGRADER_ROLE>
export type UPGRADER_ROLEReturn = FunctionReturn<typeof functions.UPGRADER_ROLE>

export type UPGRADE_INTERFACE_VERSIONParams = FunctionArguments<typeof functions.UPGRADE_INTERFACE_VERSION>
export type UPGRADE_INTERFACE_VERSIONReturn = FunctionReturn<typeof functions.UPGRADE_INTERFACE_VERSION>

export type ArticlesParams = FunctionArguments<typeof functions.articles>
export type ArticlesReturn = FunctionReturn<typeof functions.articles>

export type BalanceOfParams = FunctionArguments<typeof functions.balanceOf>
export type BalanceOfReturn = FunctionReturn<typeof functions.balanceOf>

export type BalanceOfBatchParams = FunctionArguments<typeof functions.balanceOfBatch>
export type BalanceOfBatchReturn = FunctionReturn<typeof functions.balanceOfBatch>

export type Eip712DomainParams = FunctionArguments<typeof functions.eip712Domain>
export type Eip712DomainReturn = FunctionReturn<typeof functions.eip712Domain>

export type EvaluateParams = FunctionArguments<typeof functions.evaluate>
export type EvaluateReturn = FunctionReturn<typeof functions.evaluate>

export type EvaluateWithSessionKeyParams = FunctionArguments<typeof functions.evaluateWithSessionKey>
export type EvaluateWithSessionKeyReturn = FunctionReturn<typeof functions.evaluateWithSessionKey>

export type FollowParams = FunctionArguments<typeof functions.follow>
export type FollowReturn = FunctionReturn<typeof functions.follow>

export type FollowWithSessionKeyParams = FunctionArguments<typeof functions.followWithSessionKey>
export type FollowWithSessionKeyReturn = FunctionReturn<typeof functions.followWithSessionKey>

export type GetRoleAdminParams = FunctionArguments<typeof functions.getRoleAdmin>
export type GetRoleAdminReturn = FunctionReturn<typeof functions.getRoleAdmin>

export type GrantRoleParams = FunctionArguments<typeof functions.grantRole>
export type GrantRoleReturn = FunctionReturn<typeof functions.grantRole>

export type HasRoleParams = FunctionArguments<typeof functions.hasRole>
export type HasRoleReturn = FunctionReturn<typeof functions.hasRole>

export type InitializeParams = FunctionArguments<typeof functions.initialize>
export type InitializeReturn = FunctionReturn<typeof functions.initialize>

export type IsApprovedForAllParams = FunctionArguments<typeof functions.isApprovedForAll>
export type IsApprovedForAllReturn = FunctionReturn<typeof functions.isApprovedForAll>

export type LikeCommentParams = FunctionArguments<typeof functions.likeComment>
export type LikeCommentReturn = FunctionReturn<typeof functions.likeComment>

export type LikeCommentWithSessionKeyParams = FunctionArguments<typeof functions.likeCommentWithSessionKey>
export type LikeCommentWithSessionKeyReturn = FunctionReturn<typeof functions.likeCommentWithSessionKey>

export type MinActionValueParams = FunctionArguments<typeof functions.minActionValue>
export type MinActionValueReturn = FunctionReturn<typeof functions.minActionValue>

export type MulticallParams = FunctionArguments<typeof functions.multicall>
export type MulticallReturn = FunctionReturn<typeof functions.multicall>

export type NextArticleIdParams = FunctionArguments<typeof functions.nextArticleId>
export type NextArticleIdReturn = FunctionReturn<typeof functions.nextArticleId>

export type PauseParams = FunctionArguments<typeof functions.pause>
export type PauseReturn = FunctionReturn<typeof functions.pause>

export type PausedParams = FunctionArguments<typeof functions.paused>
export type PausedReturn = FunctionReturn<typeof functions.paused>

export type PlatformFeeBpsParams = FunctionArguments<typeof functions.platformFeeBps>
export type PlatformFeeBpsReturn = FunctionReturn<typeof functions.platformFeeBps>

export type PlatformTreasuryParams = FunctionArguments<typeof functions.platformTreasury>
export type PlatformTreasuryReturn = FunctionReturn<typeof functions.platformTreasury>

export type ProxiableUUIDParams = FunctionArguments<typeof functions.proxiableUUID>
export type ProxiableUUIDReturn = FunctionReturn<typeof functions.proxiableUUID>

export type PublishParams = FunctionArguments<typeof functions.publish>
export type PublishReturn = FunctionReturn<typeof functions.publish>

export type PublishWithSessionKeyParams = FunctionArguments<typeof functions.publishWithSessionKey>
export type PublishWithSessionKeyReturn = FunctionReturn<typeof functions.publishWithSessionKey>

export type RenounceRoleParams = FunctionArguments<typeof functions.renounceRole>
export type RenounceRoleReturn = FunctionReturn<typeof functions.renounceRole>

export type RevokeRoleParams = FunctionArguments<typeof functions.revokeRole>
export type RevokeRoleReturn = FunctionReturn<typeof functions.revokeRole>

export type RoyaltyInfoParams = FunctionArguments<typeof functions.royaltyInfo>
export type RoyaltyInfoReturn = FunctionReturn<typeof functions.royaltyInfo>

export type SafeBatchTransferFromParams = FunctionArguments<typeof functions.safeBatchTransferFrom>
export type SafeBatchTransferFromReturn = FunctionReturn<typeof functions.safeBatchTransferFrom>

export type SafeTransferFromParams = FunctionArguments<typeof functions.safeTransferFrom>
export type SafeTransferFromReturn = FunctionReturn<typeof functions.safeTransferFrom>

export type SessionKeyManagerParams = FunctionArguments<typeof functions.sessionKeyManager>
export type SessionKeyManagerReturn = FunctionReturn<typeof functions.sessionKeyManager>

export type SetApprovalForAllParams = FunctionArguments<typeof functions.setApprovalForAll>
export type SetApprovalForAllReturn = FunctionReturn<typeof functions.setApprovalForAll>

export type SetMinActionValueParams = FunctionArguments<typeof functions.setMinActionValue>
export type SetMinActionValueReturn = FunctionReturn<typeof functions.setMinActionValue>

export type SetPlatformFeeParams = FunctionArguments<typeof functions.setPlatformFee>
export type SetPlatformFeeReturn = FunctionReturn<typeof functions.setPlatformFee>

export type SetPlatformTreasuryParams = FunctionArguments<typeof functions.setPlatformTreasury>
export type SetPlatformTreasuryReturn = FunctionReturn<typeof functions.setPlatformTreasury>

export type SetSessionKeyManagerParams = FunctionArguments<typeof functions.setSessionKeyManager>
export type SetSessionKeyManagerReturn = FunctionReturn<typeof functions.setSessionKeyManager>

export type SupportsInterfaceParams = FunctionArguments<typeof functions.supportsInterface>
export type SupportsInterfaceReturn = FunctionReturn<typeof functions.supportsInterface>

export type UnpauseParams = FunctionArguments<typeof functions.unpause>
export type UnpauseReturn = FunctionReturn<typeof functions.unpause>

export type UpgradeToAndCallParams = FunctionArguments<typeof functions.upgradeToAndCall>
export type UpgradeToAndCallReturn = FunctionReturn<typeof functions.upgradeToAndCall>

export type UriParams = FunctionArguments<typeof functions.uri>
export type UriReturn = FunctionReturn<typeof functions.uri>
