import { createNft } from '@metaplex-foundation/mpl-token-metadata';
import {
  generateSigner,
  percentAmount,
  publicKey,
} from '@metaplex-foundation/umi';
import { generateSignerWithSol } from '@metaplex-foundation/umi-bundle-tests';
import test from 'ava';
import {
  fetchMerkleTree,
  getCurrentRoot,
  hashLeaf,
  setAndVerifyCollection,
} from '../src';
import { createTree, createUmi, mint } from './_setup';

test('it can set and verify the collection of a minted compressed NFT', async (t) => {
  // Given a Collection NFT.
  const umi = await createUmi();
  const collectionMint = generateSigner(umi);
  const collectionAuthority = generateSigner(umi);
  await createNft(umi, {
    mint: collectionMint,
    authority: collectionAuthority,
    name: 'My Collection',
    uri: 'https://example.com/my-collection.json',
    sellerFeeBasisPoints: percentAmount(5.5), // 5.5%
    isCollection: true,
  }).sendAndConfirm(umi);

  // And a tree with a minted NFT that has no collection.
  const treeCreator = await generateSignerWithSol(umi);
  const merkleTree = await createTree(umi, { treeCreator });
  let merkleTreeAccount = await fetchMerkleTree(umi, merkleTree);
  const leafOwner = generateSigner(umi).publicKey;
  const { metadata, leafIndex } = await mint(umi, {
    merkleTree,
    treeCreatorOrDelegate: treeCreator,
    leafOwner,
  });

  // When the collection authority sets and verifies the collection.
  await setAndVerifyCollection(umi, {
    leafOwner,
    treeCreatorOrDelegate: treeCreator,
    collectionMint: collectionMint.publicKey,
    collectionAuthority,
    merkleTree,
    root: getCurrentRoot(merkleTreeAccount.tree),
    nonce: leafIndex,
    index: leafIndex,
    metadata,
    proof: [],
  }).sendAndConfirm(umi);

  // Then the leaf was updated in the merkle tree.
  const updatedLeaf = hashLeaf(umi, {
    merkleTree,
    owner: leafOwner,
    leafIndex,
    metadata: {
      ...metadata,
      collection: {
        key: collectionMint.publicKey,
        verified: true,
      },
    },
  });
  merkleTreeAccount = await fetchMerkleTree(umi, merkleTree);
  t.is(merkleTreeAccount.tree.rightMostPath.leaf, publicKey(updatedLeaf));
});

test('it cannot set and verify the collection if the tree creator or delegate does not sign', async (t) => {
  // Given a Collection NFT.
  const umi = await createUmi();
  const collectionMint = generateSigner(umi);
  const collectionAuthority = generateSigner(umi);
  await createNft(umi, {
    mint: collectionMint,
    authority: collectionAuthority,
    name: 'My Collection',
    uri: 'https://example.com/my-collection.json',
    sellerFeeBasisPoints: percentAmount(5.5), // 5.5%
    isCollection: true,
  }).sendAndConfirm(umi);

  // And a tree with a minted NFT that has no collection.
  const treeCreator = await generateSignerWithSol(umi);
  const merkleTree = await createTree(umi, { treeCreator });
  const merkleTreeAccount = await fetchMerkleTree(umi, merkleTree);
  const leafOwner = generateSigner(umi).publicKey;
  const { metadata, leafIndex } = await mint(umi, {
    merkleTree,
    treeCreatorOrDelegate: treeCreator,
    leafOwner,
  });

  // When the collection authority sets and verifies the collection
  // without the tree creator signing.
  const promise = setAndVerifyCollection(umi, {
    leafOwner,
    treeCreatorOrDelegate: treeCreator.publicKey, // <-- Here, we pass the tree creator as a public key.
    collectionMint: collectionMint.publicKey,
    collectionAuthority,
    merkleTree,
    root: getCurrentRoot(merkleTreeAccount.tree),
    nonce: leafIndex,
    index: leafIndex,
    metadata,
    proof: [],
  }).sendAndConfirm(umi);

  // Then we expect a program error.
  await t.throwsAsync(promise, { name: 'UpdateAuthorityIncorrect' });
});
