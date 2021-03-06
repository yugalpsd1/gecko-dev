package org.mozilla.gecko.tests;

import static org.mozilla.gecko.tests.helpers.AssertionHelper.*;

import org.mozilla.gecko.Actions;
import org.mozilla.gecko.R;
import org.mozilla.gecko.tests.helpers.*;

import android.view.View;

public class testHomeBanner extends UITest {

    private static final String TEST_URL = "chrome://roboextender/content/robocop_home_banner.html";
    private static final String TEXT = "The quick brown fox jumps over the lazy dog.";

    public void testHomeBanner() {
        GeckoHelper.blockForReady();

        // Make sure the banner is not visible to start.
        mAboutHome.assertVisible()
                  .assertBannerNotVisible();

        // These test methods depend on being run in this order.
        addBannerTest();
        removeBannerTest();

        // Make sure to test dismissing the banner after everything else, since dismissing
        // the banner will prevent it from showing up again.
        dismissBannerTest();
    }

    /**
     * Adds a banner message, verifies that it appears when it should, and verifies that
     * onshown/onclick handlers are called in JS.
     *
     * Note: This test does not remove the message after it is done.
     */
    private void addBannerTest() {
        addBannerMessage();

        // Load about:home again, and make sure the onshown handler is called.
        Actions.EventExpecter eventExpecter = getActions().expectGeckoEvent("TestHomeBanner:MessageShown");
        NavigationHelper.enterAndLoadUrl("about:home");
        eventExpecter.blockForEvent();

        // Verify that the banner is visible with the correct text.
        mAboutHome.assertBannerText(TEXT);

        // Test to make sure the onclick handler is called.
        eventExpecter = getActions().expectGeckoEvent("TestHomeBanner:MessageClicked");
        mAboutHome.clickOnBanner();
        eventExpecter.blockForEvent();

        // Verify that the banner isn't visible after navigating away from about:home.
        NavigationHelper.enterAndLoadUrl("about:firefox");

        // AboutHomeComponent calls mSolo.getView, which will fail an assertion if the
        // view is not present, so we need to use findViewById in this case.
        final View banner = getActivity().findViewById(R.id.home_banner);
        assertTrue("The HomeBanner is not visible", banner == null || banner.getVisibility() != View.VISIBLE);
    }


    /**
     * Removes a banner message, and verifies that it no longer appears on about:home.
     *
     * Note: This test expects for a message to have been added before it runs.
     */
    private void removeBannerTest() {
        removeBannerMessage();

        // Verify that the banner no longer appears.
        NavigationHelper.enterAndLoadUrl("about:home");
        mAboutHome.assertVisible()
                  .assertBannerNotVisible();
    }

    /**
     * Adds a banner message, verifies that its ondismiss handler is called in JS,
     * and verifies that the banner is no longer shown after it is dismissed.
     *
     * Note: This test does not remove the message after it is done.
     */
    private void dismissBannerTest() {
        // Add back the banner message to test the dismiss functionality.
        addBannerMessage();

        NavigationHelper.enterAndLoadUrl("about:home");
        mAboutHome.assertVisible();

        // Test to make sure the ondismiss handler is called when the close button is clicked.
        final Actions.EventExpecter eventExpecter = getActions().expectGeckoEvent("TestHomeBanner:MessageDismissed");
        mAboutHome.dismissBanner();
        eventExpecter.blockForEvent();

        mAboutHome.assertBannerNotVisible();
    }

    /**
     * Loads the roboextender page to add a message to the banner.
     */
    private void addBannerMessage() {
        final Actions.EventExpecter eventExpecter = getActions().expectGeckoEvent("TestHomeBanner:MessageAdded");
        NavigationHelper.enterAndLoadUrl(TEST_URL + "#addMessage");
        eventExpecter.blockForEvent();
    }

    /**
     * Loads the roboextender page to remove the message from the banner.
     */
    private void removeBannerMessage() {
        final Actions.EventExpecter eventExpecter = getActions().expectGeckoEvent("TestHomeBanner:MessageRemoved");
        NavigationHelper.enterAndLoadUrl(TEST_URL + "#removeMessage");
        eventExpecter.blockForEvent();
    }
}
