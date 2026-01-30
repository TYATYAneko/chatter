# StudyBoard

グループ学習ノート共有アプリケーション

## バージョン

**v2.1.3**

## 概要

StudyBoardは、グループでノートを共有できるWebアプリケーションです。個人情報不要で手軽に利用できます。

**v2.1.0からFirebase Authentication対応！** APIキーが見られても安全です。

## 機能

### 認証
- **アクセスコード**: 10桁の数字でサイトにアクセス
- **アカウント作成**: ニックネームとパスワードのみ（メールアドレス不要）
- **ログイン/ログアウト**
- **クロスデバイス対応**: Firebaseを設定すれば、どの端末からでもログイン可能
- **セキュア認証**: Firebase Authenticationによる安全な認証

### グループ
- **グループ作成**: 任意の名前でグループを作成
- **招待コード**: 6桁の英数字（自動生成または自分で設定可能）
- **グループ参加**: コードを入力して参加
- **グループ退出**: メニューから退出可能
- **グループ情報**: メンバー一覧などを確認

### ノート共有
- **メモ投稿**: テキストメモの投稿・共有
- **リアルタイム更新**: Firebaseでリアルタイム同期
- **システム通知**: 参加・退出の通知

### 設定
- **テーマ**: ライト / ダーク / ブルー / グリーン
- **フォントサイズ**: 小 / 中 / 大
- 設定は自動保存され、次回も反映

## 使い方

### ローカルモード（Firebase未設定）
1. `index.html` をブラウザで開く
2. アクセスコードを入力（初期値: `1234567890`）
3. アカウントを作成またはログイン
4. グループを作成、またはコードを入力して参加
5. ノート共有開始

※ローカルモードでは同一ブラウザ内でのみデータが共有されます

### オンラインモード（Firebase設定済み）
1. 下記のFirebaseセットアップを完了
2. `index.html` をブラウザで開く
3. どの端末からでもアカウントにアクセス可能！

## Firebaseセットアップ

### 1. Firebaseプロジェクトを作成
1. [Firebase Console](https://console.firebase.google.com/) にアクセス
2. 「プロジェクトを追加」をクリック
3. プロジェクト名を入力して作成

### 2. Authentication を有効化
1. 左メニュー「構築」→「Authentication」
2. 「始める」をクリック
3. 「メール / パスワード」を選択して「有効にする」
4. 「保存」

### 3. Realtime Databaseを有効化
1. 左メニューから「Realtime Database」を選択
2. 「データベースを作成」をクリック
3. ロケーションを選択（asia-southeast1 推奨）
4. 「テストモードで開始」を選択

### 4. ウェブアプリを追加
1. プロジェクト設定（歯車アイコン）→「マイアプリ」
2. 「</>」（ウェブ）をクリック
3. アプリ名を入力して登録
4. 表示される設定情報をコピー

### 5. 設定ファイルを作成
1. `firebase-config.example.js` を `firebase-config.js` にコピー
2. `firebase-config.js` を編集して設定情報を入力:

```javascript
const firebaseConfig = {
    apiKey: "あなたのAPIキー",
    authDomain: "あなたのプロジェクト.firebaseapp.com",
    databaseURL: "https://あなたのプロジェクト-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "あなたのプロジェクト",
    storageBucket: "あなたのプロジェクト.appspot.com",
    messagingSenderId: "あなたの送信者ID",
    appId: "あなたのアプリID"
};
```

**重要**: `firebase-config.js` は `.gitignore` に含まれているため、Gitにはコミットされません。

### 6. セキュリティルールの設定（重要）
Realtime Database → ルール で以下を設定:

```json
{
  "rules": {
    "users": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid"
      }
    },
    "groups": {
      "$groupCode": {
        ".read": "auth != null",
        ".write": "auth != null"
      }
    },
    "userGroups": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid"
      }
    }
  }
}
```

このルールにより：
- ログインしたユーザーのみデータにアクセス可能
- 他人のデータは読み書き不可
- APIキーが漏れても安全

## アクセスコードの変更

`app.js` の10行目を編集:

```javascript
const SITE_PASSWORD = '1234567890';  // ここを変更
```

## ファイル構成

```
Chatter/
├── index.html                 # メインHTML
├── style.css                  # スタイルシート
├── app.js                     # JavaScript（Firebase Auth対応）
├── firebase-config.js         # Firebase設定（※Gitに含まれない）
├── firebase-config.example.js # Firebase設定テンプレート
├── favicon.svg                # アイコン
├── .gitignore                 # Git除外設定
└── README.md                  # このファイル
```

## 技術仕様

- **フロントエンド**: HTML / CSS / JavaScript
- **認証**: Firebase Authentication
- **データベース**: Firebase Realtime Database
- **データ保存**:
  - オンライン: Firebase
  - オフライン: localStorage / sessionStorage
- **同期**: Firebaseリアルタイムリスナー

## セキュリティ

| 保護レベル | 内容 |
|-----------|------|
| Firebase Auth | ログイン必須でデータアクセス |
| セキュリティルール | 認証済みユーザーのみ読み書き可 |
| UID制限 | 他人のユーザーデータにアクセス不可 |

## 動作モード

| モード | Firebase設定 | データ共有範囲 | セキュリティ |
|--------|-------------|--------------|-------------|
| ローカル | 未設定 | 同一ブラウザのみ | 低 |
| オンライン | 設定済み | 全端末で共有 | 高 |

## 更新履歴

### v2.1.3
- スマホでの画面スクロール・ドラッグを防止
- ビューポート固定でUIの動きをロック
- ズーム無効化で誤操作防止

### v2.1.2
- PC画面でのノート画面の横幅を制限（最大700px）
- メッセージ入力欄と投稿ボタンの比率を7:3に調整
- 各テーマのチャット画面背景を最適化

### v2.1.1
- GitHub Pages対応: Firebase設定をインライン化
- ロビー画面のレイアウト修正（縦並びに変更）
- Firebase初期化のデバッグログ追加

### v2.1.0
- **Firebase Authentication対応**: セキュアな認証システム
- セキュリティルールで完全保護
- パスワードは6文字以上に変更（Firebase要件）
- ユーザーデータをUID単位で管理

### v2.0.0
- **Firebase対応**: 異なる端末間でデータ共有が可能に
- リアルタイム同期機能を追加
- オンライン/オフライン自動切り替え
- 非同期処理に対応

### v1.1.0
- 表記を学習ツール向けに変更
- 「ルーム」→「グループ」
- 「メッセージ」→「メモ/ノート」
- アプリ名を「StudyBoard」に変更

### v1.0.0
- 初回リリース
- アクセスコード機能
- アカウント登録・ログイン機能
- グループ作成・参加・退出機能
- ノート共有機能
- テーマ設定（4種類）
- フォントサイズ設定
