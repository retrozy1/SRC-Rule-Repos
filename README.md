# About

This is a template for turning all of the rules of a game you moderate into your own organized and easy-to-edit GitHub repository. When rules are in a repository, your community can request specific rule changes easily or report issues - you can even add specific users such as other moderators and verifiers of the game to have editing permissions! And you can keep track of different versions of rules.

When changed are made to your repository, it will push those changes to speedrun.com. Around every 20 minutes, the repository will check for changes that are made on the game's rules (or category structure) and push those back to your repository.

You'll have to authenticate the repository you create with a `PHPSESSID` cookie, a peice of data that gives the repository full access to your account. If you have security concerns about this, feel absolutely free to look at the source code.

# Instructions

## 1. Authentication

1. Open [speedrun.com](https://www.speedrun.com/) signed into the account that moderates the game you wish to do this on.
2. Press `Ctrl + Shift + i` on your keyboard.

- If using Chrome, navigate to the `Application` tab.
- If using Firefox, navigate to the `Storage` tab.

3. Find the value for the `PHPSESSID` cookie. Note this value to use in a future skip.

> [!WARNING]
> Do not share this cookie with anyone! They will have full access to your account if you do so.

## 2. Get the game's ID

1. Open the game's speedrun.com page.
2. Click on the `Stats` tab.
3. Find `ID` in the top right corner of stats - this is the game's ID.

## 3. Create your repository

1. In this repository, click the green `Use this template` button in the upper right corner, and click `Create a new repository`.
2. Make your `Repository name` something like '[Game Name] Speedrun Rules' and make your description something like 'All the speedrunning rules for [Game Name].`
3. Click `Create repository`.

## 4. Set up your repository

1. On your new repository, click `Settings` > `Secrets and variables` > `Actions`.
2. Click `New repository secret`.
3. Name the secret `PHPSESSID`, and set the value to what you found in step 1.
4. Make another secret called `GAME_ID`, and set the value to the ID you found in step 2.
5. Click the `Actions` tab (on the same navbar as `Settings` was on)
6. On the right navbar click `Check for Rule Changes on Speedrun.com`.
7. Click `Run workflow` > `Run workflow`, refresh the page, and wait until the action has finished.

If all went well, you should now see a `Rules` folder that contains all of your organized rules that you can easily edit! Now add the GitHub accounts of other moderators as editors and share it with the game's speedrunning community.

> [!NOTE]
> Other collaborators will not be able to see your repository secrets.