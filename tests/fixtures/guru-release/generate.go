// Run from the pinned Guru checkout with: go run -mod=readonly /path/to/generate.go
// No node, network, account home or wallet is used. Scalar 1 is a public test vector.
package main

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"os"

	sdk "github.com/cosmos/cosmos-sdk/types"
	signing "github.com/cosmos/cosmos-sdk/types/tx/signing"
	authsigning "github.com/cosmos/cosmos-sdk/x/auth/signing"
	banktypes "github.com/cosmos/cosmos-sdk/x/bank/types"
	"github.com/cosmos/evm/crypto/ethsecp256k1"
	"github.com/gurufinglobal/guru/v2/app"
)

func must(err error) {
	if err != nil {
		panic(err)
	}
}
func main() {
	enc, err := app.MakeEncodingConfig()
	must(err)
	scalar := make([]byte, 32)
	scalar[31] = 1
	key := &ethsecp256k1.PrivKey{Key: scalar}
	address := sdk.AccAddress(key.PubKey().Address()).String()
	recipient := sdk.AccAddress([]byte{2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2}).String()
	out := []map[string]interface{}{}
	for _, mode := range []signing.SignMode{signing.SignMode_SIGN_MODE_DIRECT, signing.SignMode_SIGN_MODE_LEGACY_AMINO_JSON} {
		builder := enc.TxConfig.NewTxBuilder()
		must(builder.SetMsgs(&banktypes.MsgSend{FromAddress: address, ToAddress: recipient, Amount: sdk.NewCoins(sdk.NewInt64Coin("agxn", 1))}))
		builder.SetFeeAmount(sdk.NewCoins(sdk.NewInt64Coin("agxn", 130)))
		builder.SetGasLimit(130000)
		data := &signing.SingleSignatureData{SignMode: mode}
		sig := signing.SignatureV2{PubKey: key.PubKey(), Data: data, Sequence: 9}
		must(builder.SetSignatures(sig))
		bytes, err := authsigning.GetSignBytesAdapter(context.Background(), enc.TxConfig.SignModeHandler(), mode,
			authsigning.SignerData{Address: address, ChainID: "guru_631-1", AccountNumber: 7, Sequence: 9, PubKey: key.PubKey()}, builder.GetTx())
		must(err)
		signature, err := key.Sign(bytes)
		must(err)
		if !key.PubKey().VerifySignature(bytes, signature) {
			panic("signature rejected by release crypto")
		}
		bad := append([]byte{}, bytes...)
		bad[len(bad)-1] ^= 1
		if key.PubKey().VerifySignature(bad, signature) {
			panic("altered bytes accepted")
		}
		data.Signature = signature
		must(builder.SetSignatures(sig))
		tx, err := enc.TxConfig.TxEncoder()(builder.GetTx())
		must(err)
		out = append(out, map[string]interface{}{"mode": int32(mode), "address": address, "recipient": recipient,
			"pubkeyHex": hex.EncodeToString(key.PubKey().Bytes()), "signBytesHex": hex.EncodeToString(bytes),
			"signatureHex": hex.EncodeToString(signature), "txHex": hex.EncodeToString(tx)})
	}
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
	must(encoder.Encode(out))
}
