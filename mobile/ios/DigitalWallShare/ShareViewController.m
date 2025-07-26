#import "ShareViewController.h"
#import <React/RCTBridge.h>
#import <React/RCTBundleURLProvider.h>
#import <React/RCTRootView.h>

@interface ShareViewController ()
@property (nonatomic, strong) RCTBridge *bridge;
@end

@implementation ShareViewController

- (void)loadView {
    NSURL *jsCodeLocation;

#ifdef DEBUG
    jsCodeLocation = [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index" fallbackResource:nil];
#else
    jsCodeLocation = [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif

    self.bridge = [[RCTBridge alloc] initWithBundleURL:jsCodeLocation
                                          moduleProvider:nil
                                           launchOptions:nil];

    RCTRootView *rootView = [[RCTRootView alloc] initWithBridge:self.bridge
                                                     moduleName:@"DigitalWallShare"
                                              initialProperties:nil];

    self.view = rootView;
}

- (BOOL)isContentValid {
    // Do validation of contentText and/or NSExtensionContext attachments here
    return YES;
}

- (void)didSelectPost {
    __block int remainingAttachments = self.extensionContext.inputItems.firstObject.attachments.count;
    __block NSMutableDictionary *sharedData = [NSMutableDictionary dictionary];

    for (NSItemProvider *itemProvider in self.extensionContext.inputItems.firstObject.attachments) {
        if ([itemProvider hasItemConformingToTypeIdentifier:@"public.url"]) {
            [itemProvider loadItemForTypeIdentifier:@"public.url" options:nil completionHandler:^(NSURL *url, NSError *error) {
                if (url) {
                    sharedData[@"url"] = url.absoluteString;
                }
                remainingAttachments--;
                if (remainingAttachments == 0) {
                    [self sendDataToReactNative:sharedData];
                }
            }];
        } else if ([itemProvider hasItemConformingToTypeIdentifier:@"public.plain-text"]) {
            [itemProvider loadItemForTypeIdentifier:@"public.plain-text" options:nil completionHandler:^(NSString *text, NSError *error) {
                if (text) {
                    sharedData[@"text"] = text;
                }
                remainingAttachments--;
                if (remainingAttachments == 0) {
                    [self sendDataToReactNative:sharedData];
                }
            }];
        } else if ([itemProvider hasItemConformingToTypeIdentifier:@"public.image"]) {
            [itemProvider loadItemForTypeIdentifier:@"public.image" options:nil completionHandler:^(UIImage *image, NSError *error) {
                if (image) {
                    sharedData[@"image"] = [image.description stringByAppendingString:@".jpg"]; // Placeholder for image data
                }
                remainingAttachments--;
                if (remainingAttachments == 0) {
                    [self sendDataToReactNative:sharedData];
                }
            }];
        }
    }
}

- (void)sendDataToReactNative:(NSDictionary *)data {
    [self.bridge.eventDispatcher sendAppEventWithName:@"ShareDataReceived" body:data];
    [self.extensionContext completeRequestReturningItems:@[] completionHandler:nil];
}

- (NSArray *)configurationItems {
    // To add configuration options via table cells at the bottom of the sheet, return an array of SLComposeSheetConfigurationItem here.
    return @[];
}

@end
