{-
This example is *greatly* inspired from jaspervdj's github example of his WebSockets Haskell package:
https://github.com/jaspervdj/websockets/blob/master/example/server.lhs

Thanks to him for providing understandable documentation and example.
-}

{-# LANGUAGE OverloadedStrings #-}

import Data.Text (Text)
import qualified Network.WebSockets as WS
import Control.Concurrent (MVar, newMVar, modifyMVar_, modifyMVar, readMVar)
import Data.Aeson
import Control.Monad (mzero, forever, forM_)
import Control.Applicative ((<$>), (<*>))
import Control.Monad.IO.Class (liftIO)
import Control.Exception (finally)

-- For simplicity, a client is just his username
type Client = (Text, WS.Connection)

-- The server will simply keep a list of connected users
type ServerState = [Client]

-- Simple type to define a nickname
data Nickname = Nickname Text
    deriving (Show, Eq)

-- Define JSON instance for Nickname
instance ToJSON Nickname where
    toJSON (Nickname nick) = object ["nickname" .= nick]

instance FromJSON Nickname where
    parseJSON (Object n) = Nickname <$> n .: "nickname"
    parseJSON _          = mzero

-- Simple type that defines the users list, to send the user
data UserList = UserList [Text]
    deriving (Show, Eq)

instance ToJSON UserList where
    toJSON (UserList xs) = object ["userlist" .= xs]

instance FromJSON UserList where
    parseJSON (Object o) = UserList <$> o .: "userlist"
    parseJSON _          = mzero

-- Simple type to define SDP message, used only to provide a JSON instance to map the user it should be sent to
data SDP = SDP
    {
        sdp    :: Text
      , target :: Text
    } deriving (Show, Eq)

instance ToJSON SDP where
    toJSON (SDP s t) = object ["sdp" .= s, "target" .= t]

instance FromJSON SDP where
    parseJSON (Object o) = SDP <$> o .: "sdp" <*> o .: "target"
    parseJSON _          = mzero

-- Initially, the server is empty
emptyServerState :: ServerState
emptyServerState = []

-- Get the number of connected users
numUsers :: ServerState -> Int
numUsers = length

-- Check if a user is connected
isUserConnected :: Client -> ServerState -> Bool
isUserConnected client = any ((== fst client) . fst)

-- Return the connection of the user whose nickname is the parameter
getConnection :: Text -> ServerState -> Maybe WS.Connection
getConnection _ [] = Nothing
getConnection nick (x:xs) | nick == fst x = Just (snd x)
                          | otherwise     = getConnection nick xs

-- Add a user if he is not already connected
addUser :: Client -> ServerState -> Either ServerState ServerState
addUser client state | isUserConnected client state = Left state 
                     | otherwise = Right $ client : state

-- Remove a user from the server
removeUser :: Client -> ServerState -> ServerState
removeUser client = filter ((/= fst client) . fst)

-- Our main function : create new, empty server state and spawn the websocket server
main :: IO ()
main = do
    putStrLn "===== .: WebSocket basic signalling server for WebRTC :. ====="
    state <- newMVar emptyServerState
    WS.runServer "0.0.0.0" 4444 $ application state

-- Application that will do the signalling
application :: MVar ServerState -> WS.ServerApp
application state pending = do
    -- Accept connection
    conn <- WS.acceptRequest pending
    users <- liftIO $ readMVar state
    putStrLn ("New connection!")

    -- We expect the client to send his nickname as a first message
    msg <- WS.receiveData conn -- :: IO Text
    case decode msg of
        Just (Nickname nick) -> flip finally (disconnect (nick, conn)) $ do
            liftIO $ modifyMVar_ state $ \s -> do
                case addUser (nick, conn) s of
                    Right newState -> do
                        putStrLn $ "New user added, now " ++ (show . numUsers $ newState) ++ " connected."
                        return newState
                    Left oldState  ->  do
                        putStrLn $ "User is already connected!"
                        return oldState
            handleUser conn state nick
        _                    -> do
            putStrLn "Wrong data received."
            WS.sendClose conn (""::Text)
    where disconnect c = do
            putStrLn $ "Diconnecting user " ++ show (fst c)
            liftIO $ modifyMVar_ state $ \s -> do
                let newState = removeUser c s
                pushUserList newState
                return newState

-- Process incomming messages from the user
handleUser :: WS.Connection -> MVar ServerState -> Text -> IO ()
handleUser conn state nick = do
    -- Upon new connection, send the new list to every connected users
    users <- liftIO $ readMVar state
    pushUserList users

    -- Then, process incomming message from that client
    forever $ do
        msg <- WS.receiveData conn
        let json = decode msg :: Maybe SDP
        case json of
            Just s  -> do
                let who = target s
                users <- liftIO $ readMVar state
                let c   = getConnection who users
                case c of
                    -- If we found the user, relay the SDP
                    Just co -> WS.sendTextData co (sdp s)
                    -- If we did not find the user, close the connection (very poor error handling)
                    Nothing -> WS.sendClose conn ("User Not Found" :: Text)
            Nothing -> do
                putStrLn "Did not get SDP"

-- Send the current list of connecte users to all of them (called upon new connection or user disconnect)
pushUserList :: ServerState -> IO ()
pushUserList users = do
    let users' = encode $ UserList $ map fst users
    forM_ users $ \u -> WS.sendTextData (snd u) users'